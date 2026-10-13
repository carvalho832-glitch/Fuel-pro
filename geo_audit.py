"""Auditoria conservadora de coordenadas ANP. Sem geocodificação ou APIs pagas.

Uma coordenada dentro da cidade não significa que o pin marque corretamente
a entrada do posto. Esta ferramenta cria uma fila de revisão; nunca "certifica"
uma localização automaticamente.
"""
from __future__ import annotations

from datetime import date, datetime, timezone
from math import radians, sin, cos, asin, sqrt
from fuel_confidence import geo_status

NEARBY_METERS = 20
STALE_GEO_DAYS = 730

def haversine_m(a, b):
    """Metros entre duas posições, usando a aproximação esférica."""
    lat1, lng1 = radians(float(a["lat"])), radians(float(a["lng"]))
    lat2, lng2 = radians(float(b["lat"])), radians(float(b["lng"]))
    dlat, dlng = lat2 - lat1, lng2 - lng1
    k = sin(dlat/2)**2 + cos(lat1)*cos(lat2)*sin(dlng/2)**2
    return 2 * 6371008.8 * asin(min(1.0, sqrt(k)))

def parse_anp_date(raw):
    if not raw:
        return None
    try:
        return datetime.strptime(str(raw).strip()[:10], "%d/%m/%Y").date()
    except ValueError:
        try:
            return date.fromisoformat(str(raw).strip()[:10])
        except ValueError:
            return None

def audit_catalog(catalog, now=None, near_m=NEARBY_METERS,
                  max_geo_age_days=STALE_GEO_DAYS):
    """(annotated_catalog, review_queue, summary); não altera a entrada."""
    now = now or datetime.now(timezone.utc)
    if near_m <= 0 or max_geo_age_days < 0:
        raise ValueError("Parâmetros de auditoria inválidos")

    by_id = {}
    for row in catalog:
        cnpj = str(row.get("cnpj") or "")
        if len(cnpj) != 14 or not cnpj.isdigit() or cnpj in by_id:
            raise ValueError("Catálogo tem CNPJ inválido ou duplicado")
        by_id[cnpj] = row

    nearby = {cnpj: [] for cnpj in by_id}
    positioned = [
        row for row in catalog if geo_status(row) != "unavailable"
    ]
    # Restringe checagens ao município. Postos próximos podem ser legítimos:
    # apenas sinalizar a coincidência para revisão, nunca concluir fraude.
    for i, a in enumerate(positioned):
        for b in positioned[i+1:]:
            if a.get("city") != b.get("city"):
                continue
            distance = haversine_m(a, b)
            if distance <= near_m:
                nearby[a["cnpj"]].append({"cnpj": b["cnpj"], "distanceMeters": round(distance, 1)})
                nearby[b["cnpj"]].append({"cnpj": a["cnpj"], "distanceMeters": round(distance, 1)})

    annotated, queue = [], []
    reasons_count = {}
    for record in catalog:
        item = dict(record)
        cnpj = item["cnpj"]
        state = geo_status(item)
        reasons = []
        if state == "unavailable":
            reasons.append("coordinates_missing_or_out_of_area")
        elif state != "validated":
            reasons.append("anp_position_not_validated")
        if nearby[cnpj]:
            reasons.append("near_another_cnpj")
        if not (item.get("name") and item.get("address")):
            reasons.append("incomplete_address_or_name")

        if state != "unavailable":
            obtained = parse_anp_date(item.get("geoDate"))
            if obtained is None:
                reasons.append("geo_date_unknown")
            else:
                age = (now.date() - obtained).days
                if age < -1:
                    reasons.append("geo_date_in_future")
                elif age > max_geo_age_days:
                    reasons.append("geo_observation_old")

        # Prioridade operacional, não nota de qualidade:
        # começar pelos preços que poderiam ser exibidos e por possíveis colisões.
        priority = ("high" if item.get("priceStatus") == "historical_observation" or nearby[cnpj]
                    else "medium" if state == "unavailable" else "normal")
        checks = {
            "priority": priority,
            "status": "review_required" if reasons else "automated_checks_passed",
            "anpValidation": state,
            "manualReviewApproved": False,
            "reasons": reasons,
            "nearbyOtherCnpjs": sorted(nearby[cnpj], key=lambda x: x["cnpj"]),
            "reviewedAt": None,
        }
        item["geoAudit"] = checks
        annotated.append(item)
        if reasons:
            queue.append({
                "cnpj": cnpj, "name": item.get("name"),
                "city": item.get("city"), "address": item.get("address"),
                "lat": item.get("lat"), "lng": item.get("lng"),
                "geoValidation": item.get("geoValidation"),
                "geoDate": item.get("geoDate"),
                "priority": priority,
                "hasRecentObservedPrice": item.get("priceStatus") == "historical_observation",
                "flags": reasons,
                "nearbyOtherCnpjs": checks["nearbyOtherCnpjs"],
                "manualReviewApproved": False,
            })
        for reason in reasons:
            reasons_count[reason] = reasons_count.get(reason, 0) + 1

    # Preços servem somente para escolher o que conferir primeiro.
    rank = {"high": 0, "medium": 1, "normal": 2}
    queue.sort(key=lambda item: (rank[item["priority"]], item.get("city") or "", item["cnpj"]))
    priorities = {name: sum(row["priority"] == name for row in queue)
                  for name in ("high", "medium", "normal")}
    summary = {
        "total": len(catalog),
        "withCoordinates": len(positioned),
        "missingCoordinates": len(catalog) - len(positioned),
        "reviewRequired": len(queue),
        "automatedChecksPassed": len(catalog) - len(queue),
        "manuallyApproved": 0,
        "priorityQueue": priorities,
        "flagCounts": dict(sorted(reasons_count.items())),
        "limits": {
            "nearOtherCnpjMeters": near_m,
            "oldGeoDays": max_geo_age_days
        },
        "interpretation": "Verificações automáticas não equivalem a validação no local."
    }
    return annotated, queue, summary
