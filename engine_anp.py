"""Fuel Pro engine: ANP weekly price measurements + official CNPJ registry.

Safe by default: writes a *staging directory*, never overwrites the live PWA
or fabricates prices/coordinates. Approval is required to publish outputs.
"""
from __future__ import annotations

import argparse
from datetime import datetime, date, timezone, timedelta
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import urlparse

import requests
from import_anp import (
    CITY_BOUNDS, UA, ANP_WEEKLY_PAGE, norm, csv_rows, xlsx_rows,
    latest_anp_file, parse_rows, has_city_coordinate,
)

API_URL = "https://revendedoresapi.anp.gov.br/v1/combustivel"
REGISTRY_CITIES = ("ARARAQUARA", "SAO JOSE DOS CAMPOS")
MAX_PRICE_AGE_DAYS = 30

def digits(value):
    return re.sub(r"\D", "", str(value or ""))

def safe_coordinate(value):
    try:
        n = float(str(value).strip().replace(",", "."))
        return n if -180 <= n <= 180 else None
    except (TypeError, ValueError):
        return None

def response_stations(payload):
    """No partial matches: accepts only the documented success envelope."""
    if not isinstance(payload, dict) or payload.get("succeeded") is not True:
        raise ValueError("API ANP indisponível ou resposta sem sucesso.")
    records = payload.get("data")
    if not isinstance(records, list):
        raise ValueError("Resposta da API ANP sem lista data.")
    filt = payload.get("searchPageFilter") or {}
    if isinstance(filt, dict):
        # Guard against silently truncated pagination on future API changes.
        page_count = next((filt[k] for k in
            ("totalPages", "totalPaginas", "totalDePaginas", "quantidadePaginas")
            if k in filt), None)
        if page_count is not None and int(page_count) > 1:
            raise ValueError("Pesquisa de revendedores paginada: implementar paginação antes de publicar.")
    return records

def anp_registry(cities=REGISTRY_CITIES, session=None):
    session = session or requests.Session()
    session.headers.update({"User-Agent": UA, "Accept": "application/json"})
    result = {}
    counts = {}
    for city in cities:
        r = session.get(API_URL, params={"municipio": city, "uf": "SP"}, timeout=60)
        r.raise_for_status()
        items = response_stations(r.json())
        counts[city] = len(items)
        for item in items:
            if not isinstance(item, dict):
                continue
            cnpj = digits(item.get("cnpj"))
            if len(cnpj) != 14 or norm(item.get("municipio")) != city or norm(item.get("uf")) != "SP":
                continue
            lat, lng = safe_coordinate(item.get("latitude")), safe_coordinate(item.get("longitude"))
            if lat is not None and lng is not None and not has_city_coordinate(city, lat, lng):
                lat = lng = None
            result[cnpj] = {
                "cnpj": cnpj, "name": item.get("razaoSocial") or "",
                "address": item.get("endereco") or "",
                "district": item.get("bairro") or "",
                "city": city,
                "brand": item.get("distribuidora") or "",
                "lat": lat, "lng": lng,
                "geoValidation": item.get("validacao") or "",
                "geoAccuracyMeters": item.get("estimativaAcuracia") or None,
                "geoSource": "ANP - API Revendedores",
                "geoDate": item.get("dataObtencao") or "",
                "regulatoryStatusRaw": item.get("statusSIGAF") or "",
            }
    return result, counts

def history_rows(stations):
    observations = []
    for p in stations:
        for fuel, price in p["prices"].items():
            observed_at = p["collectedAtByFuel"].get(fuel)
            if observed_at:
                observations.append({
                    "cnpj": p["cnpj"], "fuel": fuel, "price": price,
                    "collectedAt": observed_at, "source": "ANP - levantamento semanal",
                })
    return observations

def update_history(previous, latest):
    """Append by immutable measurement key, correcting duplicates without losing weeks."""
    unique = {}
    for item in [*previous, *latest]:
        if not isinstance(item, dict):
            continue
        cnpj, fuel, d = digits(item.get("cnpj")), item.get("fuel"), item.get("collectedAt")
        if len(cnpj) != 14 or fuel not in ("gas", "gas_ad", "eta", "eta_ad", "die", "die_s10", "gnv") or not isinstance(d, str):
            continue
        try:
            price = float(item.get("price"))
            stamp = date.fromisoformat(d)
        except (ValueError, TypeError):
            continue
        if not (0.5 < price < 30) or stamp > date.today() + timedelta(days=1):
            continue
        record = {
            "cnpj": cnpj, "fuel": fuel, "price": round(price, 2),
            "collectedAt": d, "source": "ANP - levantamento semanal",
        }
        unique[(cnpj, fuel, d)] = record
    return sorted(unique.values(), key=lambda x: (x["collectedAt"], x["cnpj"], x["fuel"]))

def join_prices(prices, registry, now=None):
    now = now or datetime.now(timezone.utc)
    output, missing, no_coords, old = [], [], [], []
    for p in prices:
        cnpj = p["cnpj"]
        cadastro = registry.get(cnpj)
        if not cadastro or cadastro["city"] != p["city"]:
            missing.append(cnpj)
            continue
        if cadastro["lat"] is None or cadastro["lng"] is None:
            no_coords.append(cnpj)
            continue
        accepted = {}
        dates = {}
        for fuel, amount in p["prices"].items():
            text = p["collectedAtByFuel"].get(fuel)
            try:
                collected = date.fromisoformat(text)
            except (ValueError, TypeError):
                continue
            age = (now.date() - collected).days
            if age < -1 or age > MAX_PRICE_AGE_DAYS:
                old.append((cnpj, fuel))
                continue
            accepted[fuel] = amount
            dates[fuel] = text
        if not accepted:
            continue
        # ANP registry's geographical position may itself be marked unvalidated.
        geovalidated = norm(cadastro["geoValidation"]) in (
            "POSICAO GEOGRAFICA VALIDADA", "VALIDADA"
        )
        output.append({
            "id": cnpj, "cnpj": cnpj,
            "name": cadastro["name"] or p["name"],
            "address": ", ".join(filter(None, (cadastro["address"], cadastro["district"], p["city"].title()+" - SP"))),
            "city": p["city"],
            "lat": cadastro["lat"], "lng": cadastro["lng"],
            "brand": cadastro["brand"], "source": p["source"],
            "locationPrecision": "official" if geovalidated else "approximate",
            "locationValidated": geovalidated,
            "geoSource": cadastro["geoSource"],
            "prices": accepted, "collectedAtByFuel": dates,
        })
    return sorted(output, key=lambda p: (p["city"], p["cnpj"])), {
        "withoutRegistry": sorted(missing), "withoutCoordinates": sorted(no_coords),
        "excludedStaleFuelObservations": len(old),
    }

def payload_prices(binary):
    rows = xlsx_rows(binary) if binary[:2] == b"PK" else csv_rows(binary)
    return parse_rows(rows)

def build(prices_binary, registry, counts, previous_history=None, now=None):
    now = now or datetime.now(timezone.utc)
    stations = payload_prices(prices_binary)
    if not stations:
        raise ValueError("Nenhum preço real da ANP encontrado nas cidades piloto.")
    latest = history_rows(stations)
    history = update_history(previous_history or [], latest)
    mapped, issues = join_prices(stations, registry, now=now)
    status = {
        "generatedAt": now.isoformat(), "priceSource": ANP_WEEKLY_PAGE,
        "registrySource": API_URL, "priceSampling": "weekly",
        "cities": list(REGISTRY_CITIES), "registryCounts": counts,
        "stationsWithPrices": len(stations), "stationsWithCoordinatesAndPrices": len(mapped),
        "fuelObservationsInCurrentSurvey": len(latest),
        "historyObservations": len(history),
        "missingRegistry": len(issues["withoutRegistry"]),
        "missingCoordinates": len(issues["withoutCoordinates"]),
        "expiredObservations": issues["excludedStaleFuelObservations"],
        "safeToPublish": bool(mapped),
        "note": "Preço ANP é amostral e coletado, não preço em tempo real. Coordenadas podem não estar validadas.",
    }
    return mapped, history, status

def atomic_json(path, obj):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(json.dumps(obj, ensure_ascii=False, indent=2, allow_nan=False) + "\n", encoding="utf-8")
    tmp.replace(path)

def run(prices_file=None, registry_file=None, out_dir="staging", prev=None, session=None):
    session = session or requests.Session()
    session.headers.update({"User-Agent": UA})
    prices_binary = Path(prices_file).read_bytes() if prices_file else latest_anp_file(session)
    if registry_file:
        source = json.loads(Path(registry_file).read_text(encoding="utf-8"))
        raw_registry = source.get("records") or {}
        registry, counts = raw_registry, source.get("counts") or {}
    else:
        registry, counts = anp_registry(session=session)
    previous = json.loads(Path(prev).read_text(encoding="utf-8")) if prev and Path(prev).exists() else []
    mapped, history, status = build(prices_binary, registry, counts, previous)
    out = Path(out_dir)
    atomic_json(out/"status.json", status)
    atomic_json(out/"historico_anp.json", history)
    # No publish if there are zero verified prices. Keep staging explicit and reviewable.
    atomic_json(out/"dados_candidatos.json", mapped)
    print(json.dumps(status, ensure_ascii=False, indent=2))
    return status

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Fuel Pro staging: price + cadastro ANP")
    parser.add_argument("--prices-file", help="Arquivo ANP XLSX/CSV (omitido: baixa oficial)")
    parser.add_argument("--registry-file", help="JSON de cadastro ANP de teste (omitido: API oficial)")
    parser.add_argument("--out-dir", default="staging", help="Diretório isolado para revisão")
    parser.add_argument("--prev", help="Caminho opcional do histórico anterior")
    args = parser.parse_args()
    run(args.prices_file, args.registry_file, args.out_dir, args.prev)
