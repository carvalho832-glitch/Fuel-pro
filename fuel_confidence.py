"""Fuel Pro: transparent evidence-based indicators, NOT a fuel-quality certificate.

No quality stars, numeric reputation score, or "trusted station" badge is
created from the ANP register or from fuel price alone. The Fuel Score is a
group of independent evidence indicators, each with an explicit unknown state.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from import_anp import norm, CITY_BOUNDS, has_city_coordinate

PRICE_SOURCE = "ANP - levantamento semanal"
REGISTRY_SOURCE = "ANP - API Revendedores"


def geo_status(station):
    lat, lng, city = station.get("lat"), station.get("lng"), station.get("city")
    if lat is None or lng is None or city not in CITY_BOUNDS:
        return "unavailable"
    try:
        if not has_city_coordinate(city, float(lat), float(lng)):
            return "unavailable"
    except (ValueError, TypeError):
        return "unavailable"
    validation = norm(station.get("geoValidation", ""))
    if validation in ("POSICAO GEOGRAFICA VALIDADA", "VALIDADA"):
        return "validated"
    return "not_validated"


def price_evidence(price, collected_at, source, now=None):
    """Observed freshness only. Never implies confirmed pump price."""
    now = now or datetime.now(timezone.utc)
    result = {
        "source": source if source == PRICE_SOURCE else None,
        "collectedAt": collected_at if isinstance(collected_at, str) else None,
        "ageDays": None, "freshness": "unknown", "available": False,
        "confirmedAtPump": False, "isLive": False
    }
    if source != PRICE_SOURCE:
        return result
    try:
        observed = date.fromisoformat(collected_at)
        amount = float(price)
    except (TypeError, ValueError):
        return result
    days = (now.date() - observed).days
    if days < -1 or not (0.5 < amount < 30):
        return result
    result["ageDays"] = days
    # These bands are about recency, not station reputation or fuel quality.
    result["freshness"] = (
        "up_to_3_days" if days <= 3 else
        "4_to_7_days" if days <= 7 else
        "8_to_14_days" if days <= 14 else
        "15_to_30_days" if days <= 30 else
        "over_30_days"
    )
    result["available"] = days <= 30
    return result


def evidence_profile(station, now=None):
    """Build three independent axes: price recency, location, and quality.

    'quality' and 'community' stay unrated until real, attributable evidence
    and a separately reviewed scoring method exist.
    """
    now = now or datetime.now(timezone.utc)
    prices = station.get("prices") or {}
    dates = station.get("collectedAtByFuel") or {}
    details = {
        fuel: price_evidence(value, dates.get(fuel), station.get("source"), now)
        for fuel, value in prices.items()
    }
    coordinate_state = geo_status(station)
    return {
        "version": 1,
        "priceEvidenceByFuel": details,
        "location": {
            "source": station.get("geoSource") if coordinate_state != "unavailable" else None,
            "status": coordinate_state,
            "verifiedOnSite": False
        },
        "quality": {
            "status": "not_evaluated", "rating": None,
            "laboratoryEvidence": None, "summary": "Sem prova laboratorial associada ao CNPJ"
        },
        "community": {
            "status": "not_evaluated", "rating": None,
            "verifiedReviewCount": 0
        },
        "overallScore": None,
        "overallScoreReason": "Não há evidências suficientes para classificar a qualidade do posto"
    }


def build_station_catalog(registry, mapped=None, now=None):
    """Provide all registered stations, including stations WITHOUT ANP prices.

    Never adds estimated prices. Entries with missing coordinates cannot be
    placed on the map. Do not interpret being in this catalog as authorization
    or proven compliance with the PMQC.
    """
    now = now or datetime.now(timezone.utc)
    priced = {post["cnpj"]: post for post in (mapped or [])}
    catalog = []
    for cnpj, reg in sorted(registry.items(), key=lambda item: (item[1].get("city", ""), item[0])):
        status = geo_status(reg)
        post = priced.get(cnpj)
        observed_prices = dict(post.get("prices") or {}) if post else {}
        observed_dates = dict(post.get("collectedAtByFuel") or {}) if post else {}
        source = PRICE_SOURCE if observed_prices else None
        record = {
            "id": cnpj, "cnpj": cnpj,
            "name": reg.get("name") or "Posto sem nome no cadastro",
            "address": reg.get("address") or "",
            "district": reg.get("district") or "",
            "city": reg.get("city") or "",
            "brand": reg.get("brand") or "",
            "lat": reg.get("lat") if status != "unavailable" else None,
            "lng": reg.get("lng") if status != "unavailable" else None,
            "mapEligible": status != "unavailable",
            "geoSource": reg.get("geoSource") if status != "unavailable" else None,
            "geoValidation": reg.get("geoValidation") or "",
            "priceStatus": "historical_observation" if observed_prices else "not_available",
            "source": source,
            "prices": observed_prices,
            "collectedAtByFuel": observed_dates,
        }
        record["fuelScore"] = evidence_profile(record, now)
        catalog.append(record)
    return catalog
