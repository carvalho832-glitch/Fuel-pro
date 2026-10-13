"""Conferência entre endereço do levantamento de preço ANP e cadastro ANP.

Apenas sinaliza coerência textual entre DUAS FONTES da MESMA agência.
Jamais equivale a GPS validado, visita ao local ou aprovação do pin.
"""
from __future__ import annotations

import re
from import_anp import norm

STOP = {"AVENIDA", "RUA", "ESTRADA", "RODOVIA", "TRAVESSA", "ALAMEDA",
        "PRACA", "DO", "DA", "DE", "DOS", "DAS", "SAO", "SP"}

def street_parts(text, official_price=False):
    items=[piece.strip() for piece in (text or "").split(",")]
    if not items:
        return set(), None
    street = norm(items[0])
    words = {tok for tok in re.findall(r"[A-Z0-9]+", street) if tok not in STOP and len(tok) > 1}
    if official_price:
        number = re.sub(r"\D", "", items[1]) if len(items)>1 else ""
    else:
        number = re.sub(r"\D", "", items[1]) if len(items)>1 else ""
        if not number:
            found=re.search(r"\b\d{1,5}\b", street)
            number=found.group() if found else ""
    return words, (number.lstrip("0") or None)

def compare_cadastral_addresses(price_stations, registry, high_priority):
    """Retorna apenas os postos prioritários. Não modifica o cadastro."""
    sampled={post["cnpj"]:post for post in price_stations}
    results=[]
    for candidate in high_priority:
        if candidate.get("priority") != "high":
            continue
        cnpj=candidate["cnpj"]
        observation=sampled.get(cnpj)
        reg=registry.get(cnpj)
        entry={
            "cnpj":cnpj,"name":candidate.get("name"),"city":candidate.get("city"),
            "priority":"high","priceSource":"ANP - levantamento semanal",
            "registrySource":"ANP - API Revendedores",
            "priceSampleAddress":observation.get("address") if observation else None,
            "registryAddress":reg.get("address") if reg else None,
            "status":"not_comparable","streetTokenOverlap":None,"houseNumberEqual":None,
            "manualReviewApproved":False,
            "note":"Comparação textual não confirma as coordenadas geográficas do posto"
        }
        if observation and reg and observation.get("city")==reg.get("city"):
            a, anum=street_parts(observation.get("address"),True)
            b,bnum=street_parts(reg.get("address"))
            if a and b and anum and bnum:
                overlap=len(a & b)/max(1,min(len(a),len(b)))
                consistent=overlap>=0.67 and anum==bnum
                entry["streetTokenOverlap"]=round(overlap,2)
                entry["houseNumberEqual"]=anum==bnum
                entry["status"]=(
                    "textually_consistent_unverified_location" if consistent
                    else "address_discrepancy_needs_review"
                )
        results.append(entry)
    summary={
        "highPriorityCount":len(results),
        "compared":sum(x["status"]!="not_comparable" for x in results),
        "textuallyConsistent":sum(x["status"]=="textually_consistent_unverified_location" for x in results),
        "addressDiscrepancies":sum(x["status"]=="address_discrepancy_needs_review" for x in results),
        "withoutComparableAddress":sum(x["status"]=="not_comparable" for x in results),
        "approvedLocations":0,
        "note":"Acordo entre endereços ANP não é verificação independente de GPS"
    }
    return results,summary
