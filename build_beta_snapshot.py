"""Gera snapshot de homologação Fuel Pro Beta a partir de staging ANP.

Não publica na internet nem marca os postos como aprovados.
A saída deve ser revisada e implantada separadamente, nunca em main.
"""
from __future__ import annotations

import argparse
from datetime import date, datetime, timezone
import hashlib
import json
from pathlib import Path

from fuel_confidence import PRICE_SOURCE, REGISTRY_SOURCE, geo_status
from import_anp import CITY_BOUNDS

VALID_FUELS = {"gas", "eta", "gas_ad", "eta_ad", "die", "die_s10", "gnv"}
OFFICIAL_PMQC_PREFIX = ("https://www.gov.br/anp/pt-br/centrais-de-conteudo/"
                        "dados-abertos/arquivos/pmqc/")
PRICE_PAGE_PREFIX = "https://www.gov.br/anp/"

def valid_cnpj(cnpj):
    return isinstance(cnpj, str) and len(cnpj) == 14 and cnpj.isdecimal()

def date_age(raw, now):
    try:
        sample = date.fromisoformat(raw)
        delta = (now.date() - sample).days
        return delta if -1 <= delta <= 30 else None
    except (TypeError, ValueError):
        return None

def public_pmqc(info):
    if not isinstance(info, dict) or info.get("source") != "ANP - PMQC":
        return None
    try:
        samples = int(info["sampleCount"])
        nonconforming = int(info["samplesWithNonconformity"])
        day = date.fromisoformat(info["latestSampleAt"])
    except (ValueError, TypeError, KeyError):
        return None
    if samples < 1 or not 0 <= nonconforming <= samples:
        return None
    return {
        "sampleCount": samples,
        "latestSampleAt": day.isoformat(),
        "samplesWithNonconformity": nonconforming,
        "samplesWithAllReportedAssaysConforming": int(
            info.get("samplesWithAllReportedAssaysConforming", 0)
        ),
    }

def build_snapshot(catalog, status, pmqc, now=None):
    """Strict fail-closed. Produce no fabricated prices, fake ratings or routes."""
    now = now or datetime.now(timezone.utc)
    if not isinstance(catalog, list) or not catalog or not isinstance(pmqc, dict):
        raise ValueError("Fontes staging vazias ou inválidas")
    if status.get("publicationApproved") is not False:
        raise ValueError("Staging não pode estar aprovado como produção")
    if status.get("priceSource", "").startswith(PRICE_PAGE_PREFIX) is False:
        raise ValueError("Fonte de preço não é ANP oficial")
    if status.get("registrySource") != "https://revendedoresapi.anp.gov.br/v1/combustivel":
        raise ValueError("Cadastro não é API ANP")
    if len(catalog) != status.get("catalogStations"):
        raise ValueError("Contagem de postos divergente no staging")

    source_labs = status.get("pmqc") or {}
    lab_source = source_labs.get("fileUrl")
    if pmqc and (not isinstance(lab_source, str) or
                 not lab_source.startswith(OFFICIAL_PMQC_PREFIX)):
        raise ValueError("Evidências laboratoriais sem origem oficial")
    seen = set()
    stations = []
    for p in catalog:
        cnpj = p.get("cnpj")
        if not valid_cnpj(cnpj) or cnpj in seen:
            raise ValueError("CNPJ ausente ou duplicado na base")
        seen.add(cnpj)
        city = p.get("city")
        if city not in CITY_BOUNDS:
            raise ValueError("Município fora das cidades piloto")
        audit = p.get("geoAudit")
        fuel_score = p.get("fuelScore")
        if not isinstance(audit, dict) or audit.get("manualReviewApproved") is not False:
            raise ValueError("Auditoria geográfica obrigatória")
        if not isinstance(fuel_score, dict) or fuel_score.get("overallScore") is not None:
            raise ValueError("Nota não auditada não pode entrar na Beta")
        if fuel_score.get("quality", {}).get("rating") is not None:
            raise ValueError("Ranking de laboratório proibido na Beta")

        can_map = bool(p.get("mapEligible"))
        is_within_bounds = geo_status(p) != "unavailable"
        if can_map != is_within_bounds:
            raise ValueError(f"Coordenadas inconsistentes para {cnpj}")
        if can_map:
            lat, lng = float(p["lat"]), float(p["lng"])
        else:
            lat = lng = None
        source = p.get("source")
        prices, collected = {}, {}
        for fuel, raw_price in (p.get("prices") or {}).items():
            if fuel not in VALID_FUELS:
                continue
            raw_date = (p.get("collectedAtByFuel") or {}).get(fuel)
            age = date_age(raw_date, now)
            if (source == PRICE_SOURCE and age is not None
                    and type(raw_price) in (int, float)
                    and 0.5 < raw_price < 30 and can_map):
                prices[fuel] = round(raw_price, 2)
                collected[fuel] = raw_date
        # Never represent older prices as an up-to-date observation.
        has_price = bool(prices)
        candidate_lab = public_pmqc(pmqc.get(cnpj))
        entry = {
            "cnpj": cnpj, "name": str(p.get("name") or "Posto cadastrado na ANP"),
            "address": str(p.get("address") or ""),
            "district": str(p.get("district") or ""),
            "city": city, "brand": p.get("brand") or None,
            "mapEligible": can_map, "lat": lat, "lng": lng,
            "geoValidated": False,
            "geoSource": REGISTRY_SOURCE if can_map else None,
            "geoRecordedAt": str(p.get("geoDate") or "") if can_map else None,
            "geoAudit": {
                "manualReviewApproved": False,
                "priority": audit.get("priority") if audit.get("priority") in ("high", "medium", "normal") else "normal",
                "reasons": audit.get("reasons") if isinstance(audit.get("reasons"), list) else [],
            },
            "priceStatus": "historical_observation" if has_price else "not_available",
            "source": PRICE_SOURCE if has_price else None,
            "prices": prices, "collectedAtByFuel": collected,
            "fuelScoreOverall": None, "pmqc": candidate_lab,
        }
        stations.append(entry)

    counts = {
        "registered": len(stations),
        "mapEligible": sum(p["mapEligible"] for p in stations),
        "withRecentPrice": sum(bool(p["prices"]) for p in stations),
        "withLabSamples": sum(p["pmqc"] is not None for p in stations),
        "withoutCoords": sum(not p["mapEligible"] for p in stations),
    }
    if counts["mapEligible"] != status.get("catalogWithCoordinates"):
        raise ValueError("Número de posições ANP sofreu alteração inesperada")
    if counts["withRecentPrice"] > status.get("stationsWithCoordinatesAndPrices", 0):
        raise ValueError("Preços da Beta excedem observações do motor")
    fingerprint = hashlib.sha256(
        json.dumps({"stations": stations, "source": status.get("generatedAt")},
                   ensure_ascii=False, sort_keys=True).encode("utf-8")
    ).hexdigest()[:16]
    return {
        "beta": True, "homologationOnly": True, "release": "fuel-pro-anp-beta-2",
        "generatedAt": now.isoformat(), "observedDataGeneratedAt": status.get("generatedAt"),
        "snapshotId": fingerprint,
        "sources": {
            "registry": status["registrySource"],
            "prices": status["priceSource"],
            "pmqc": lab_source,
        },
        "notice": "Coordenadas provisórias, coleta ANP datada, PMQC amostral.",
        "approval": {"publicationApproved": False, "coordinatesVerifiedOnSite": 0},
        "counts": counts, "stations": stations,
    }

def write_snapshot(catalog_path, status_path, pmqc_path, output_path, now=None):
    catalog = json.loads(Path(catalog_path).read_text(encoding="utf-8"))
    status = json.loads(Path(status_path).read_text(encoding="utf-8"))
    pmqc = json.loads(Path(pmqc_path).read_text(encoding="utf-8"))
    snapshot = build_snapshot(catalog, status, pmqc, now)
    dest = Path(output_path)
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + ".tmp")
    tmp.write_text(json.dumps(snapshot, ensure_ascii=False, separators=(",", ":"), allow_nan=False) + "\n",
                   encoding="utf-8")
    tmp.replace(dest)
    print("Fuel Pro Beta preparada para homologação (não publicada):", snapshot["counts"])
    return snapshot

if __name__ == "__main__":
    p = argparse.ArgumentParser(description="Gerar snapshot Fuel Pro Beta para revisão, sem publicar")
    p.add_argument("--catalog", default="data/catalogo_postos_anp.json")
    p.add_argument("--status", default="data/engine_status.json")
    p.add_argument("--pmqc", default="data/pmqc_evidencias_anp.json")
    p.add_argument("--out", default="beta/dados.json")
    a = p.parse_args()
    write_snapshot(a.catalog, a.status, a.pmqc, a.out)
