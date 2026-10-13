"""Confronta coordenadas da API de postos com pontos de amostras do PMQC.

Os dois conjuntos são da ANP e PODEM compartilhar origem cadastral.
Concordância não verifica GPS em campo. Divergência exige revisão humana.
"""
from __future__ import annotations
from datetime import date
from geo_audit import haversine_m
from fuel_confidence import geo_status

DIFFERENCE_METERS = 150

def compare_pmqc_positions(catalog, pmqc, threshold_m=DIFFERENCE_METERS):
    if not 0 < threshold_m <= 5000:
        raise ValueError("Limite de divergência deve ser entre 0 e 5000 metros")
    by_id={p["cnpj"]:p for p in catalog}
    results={}
    summary={
        "stationsWithSamples":0, "pmqcWithCoordinates":0, "comparableStations":0,
        "anpDatasetPositionsWithinThreshold":0, "anpDatasetPositionsDivergent":0,
        "pmqcWithoutCoordinates":0, "registryWithoutCoordinates":0,
        "conflictingPositionsWithinSample":0, "thresholdMeters":threshold_m,
        "manuallyVerified":0,
        "interpretation":"Comparação entre dois arquivos da ANP; concordância não comprova posição em campo."
    }
    for cnpj, lab in sorted(pmqc.items()):
        if cnpj not in by_id:
            continue
        summary["stationsWithSamples"]+=1
        post=by_id[cnpj]
        observations=[]
        conflict=False
        for sample in lab.get("samples", []):
            if sample.get("geoPositionsConflictWithinSample"):
                conflict=True
            for point in sample.get("reportedGeoPositions", []):
                try:
                    lat, lng=float(point["lat"]),float(point["lng"])
                    # The PMQC importer has already restricted these points
                    # to the target city. Still avoid null/non-finite points.
                    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
                        continue
                    stamp=date.fromisoformat(sample["collectedAt"])
                except (ValueError,TypeError,KeyError):
                    continue
                observations.append({
                    "sampleId":str(sample.get("sampleId") or ""),
                    "collectedAt":stamp.isoformat(),
                    "lat":lat,"lng":lng
                })
        if conflict:
            summary["conflictingPositionsWithinSample"]+=1
        if not observations:
            state="pmqc_without_coordinates"
            summary["pmqcWithoutCoordinates"]+=1
            info={"status":state,"samplePositions":0,"comparedAt":None,
                  "distanceMeters":None,"thresholdMeters":threshold_m,
                  "manualReviewApproved":False,
                  "sameAgencySources":True}
            results[cnpj]=info
            continue
        summary["pmqcWithCoordinates"]+=1
        if geo_status(post)=="unavailable":
            summary["registryWithoutCoordinates"]+=1
            state="registry_without_coordinates"
            result={"status":state,"samplePositions":len(observations),
                    "comparedAt":max(x["collectedAt"] for x in observations),
                    "distanceMeters":None,"thresholdMeters":threshold_m,
                    "manualReviewApproved":False,"sameAgencySources":True}
            results[cnpj]=result
            continue
        # Prefer the most recently collected observation. A sample's
        # duplicate assay rows do not become extra inspections.
        newest=max(x["collectedAt"] for x in observations)
        recent=[x for x in observations if x["collectedAt"]==newest]
        distances=[round(haversine_m(post,p),1) for p in recent]
        biggest=max(distances)
        state="anp_sources_diverge" if biggest > threshold_m else "anp_sources_nearby_unverified"
        summary["comparableStations"]+=1
        if biggest > threshold_m:
            summary["anpDatasetPositionsDivergent"]+=1
        else:
            summary["anpDatasetPositionsWithinThreshold"]+=1
        results[cnpj]={
            "status":state, "samplePositions":len(observations),
            "comparedAt":newest, "distanceMeters":biggest,
            "thresholdMeters":threshold_m, "manualReviewApproved":False,
            "sameAgencySources":True
        }
    return results,summary

def add_comparison_to_audit(catalog, queue, summary, checks):
    """Enriquece dados de staging sem elevar confidência ou aprovar GPS."""
    pending={p["cnpj"]:p for p in queue}
    by_id={p["cnpj"]:p for p in catalog}
    for cnpj, comparison in checks.items():
        p=by_id[cnpj]
        p["geoAudit"]["pmqcCrosscheck"]=comparison
        item=pending.get(cnpj)
        if item is not None:
            item["pmqcCrosscheck"]=comparison
        discrepancy=comparison["status"]=="anp_sources_diverge"
        if not discrepancy:
            continue
        if "pmqc_anp_geoposition_divergence" not in p["geoAudit"]["reasons"]:
            p["geoAudit"]["reasons"].append("pmqc_anp_geoposition_divergence")
        p["geoAudit"]["status"]="review_required"
        p["geoAudit"]["priority"]="high"
        if item is None:
            item={
                "cnpj":cnpj, "name":p.get("name"),"city":p.get("city"),
                "address":p.get("address"),"lat":p.get("lat"),"lng":p.get("lng"),
                "geoValidation":p.get("geoValidation"),"geoDate":p.get("geoDate"),
                "flags":list(p["geoAudit"]["reasons"]),
                "nearbyOtherCnpjs":p["geoAudit"].get("nearbyOtherCnpjs",[]),
                "hasRecentObservedPrice":p.get("priceStatus")=="historical_observation",
                "manualReviewApproved":False,
            }
            pending[cnpj]=item
        else:
            if "pmqc_anp_geoposition_divergence" not in item["flags"]:
                item["flags"].append("pmqc_anp_geoposition_divergence")
        item["priority"]="high"
        item["pmqcCrosscheck"]=comparison
    rank={"high":0,"medium":1,"normal":2}
    updated=sorted(pending.values(),key=lambda x:(
        rank.get(x.get("priority"),2),x.get("city") or "",x["cnpj"]))
    summary["reviewRequired"]=len(updated)
    summary["automatedChecksPassed"]=len(catalog)-len(updated)
    summary["priorityQueue"]={key:sum(row.get("priority")==key for row in updated)
                              for key in rank}
    summary["flagCounts"]={
        key:sum(key in row.get("flags",[]) for row in updated)
        for key in sorted({flag for row in updated for flag in row.get("flags",[])})
    }
    return updated
