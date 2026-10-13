import unittest
from datetime import datetime, timezone
from pmqc_quality import parse_pmqc_csv
from pmqc_geo_crosscheck import compare_pmqc_positions, add_comparison_to_audit

CNPJ="12345678000190"
OTHER="12345678000191"
NOW=datetime(2026,10,12,tzinfo=timezone.utc)
HEADER="DataColeta;IdNumeric;Produto;CnpjPosto;Município;Uf;Ensaio;Conforme;Latitude;Longitude"

def pmqc_bytes(*rows):
    return (HEADER+"\n"+"\n".join(rows)+"\n").encode("utf-8")

def laboratory(lat="-21.8001",lng="-48.1801",sample="17",test="Densidade"):
    return ";".join(("2026-09-03",sample,"GASOLINA C COMUM",CNPJ,
        "ARARAQUARA","SP",test,"Sim",str(lat),str(lng)))

def catalog(lat=-21.8,lng=-48.18):
    return [{
        "cnpj":CNPJ, "lat":lat, "lng":lng,"city":"ARARAQUARA",
        "geoValidation":"Posição Geográfica não validada",
        "geoSource":"ANP - API Revendedores",
        "geoAudit":{"reasons":["anp_position_not_validated"],
                    "status":"review_required","priority":"normal",
                    "manualReviewApproved":False},
        "priceStatus":"not_available"
    }]

class PMQCGeoCrosscheckTests(unittest.TestCase):
    def test_accept_geodata_in_sample_not_multiple_ensaios(self):
        reg={CNPJ:{"city":"ARARAQUARA"}}
        evidence=parse_pmqc_csv(pmqc_bytes(laboratory(),laboratory(test="Aspecto")),reg,NOW)
        self.assertEqual(evidence[CNPJ]["sampleCount"],1)
        positions=evidence[CNPJ]["samples"][0]["reportedGeoPositions"]
        self.assertEqual(positions,[{"lat":-21.8001,"lng":-48.1801}])
        self.assertFalse(evidence[CNPJ]["samples"][0]["geoPositionsConflictWithinSample"])

    def test_close_anp_datasets_not_certify_location(self):
        evidence=parse_pmqc_csv(pmqc_bytes(laboratory()),{CNPJ:{"city":"ARARAQUARA"}},NOW)
        checks,summary=compare_pmqc_positions(catalog(),evidence)
        self.assertEqual(summary["comparableStations"],1)
        self.assertEqual(summary["anpDatasetPositionsWithinThreshold"],1)
        self.assertEqual(checks[CNPJ]["status"],"anp_sources_nearby_unverified")
        self.assertLess(checks[CNPJ]["distanceMeters"],150)
        self.assertFalse(checks[CNPJ]["manualReviewApproved"])
        self.assertTrue(checks[CNPJ]["sameAgencySources"])

    def test_large_distance_flags_review_and_reprioritizes(self):
        evidence=parse_pmqc_csv(pmqc_bytes(laboratory(lat="-21.83",lng="-48.21")),{CNPJ:{"city":"ARARAQUARA"}},NOW)
        items=catalog()
        checks,summary=compare_pmqc_positions(items,evidence)
        self.assertEqual(summary["anpDatasetPositionsDivergent"],1)
        self.assertGreater(checks[CNPJ]["distanceMeters"],150)
        queue=[{"cnpj":CNPJ,"priority":"normal","city":"ARARAQUARA",
                "flags":["anp_position_not_validated"],"manualReviewApproved":False}]
        geo_summary={"manuallyApproved":0}
        updated=add_comparison_to_audit(items,queue,geo_summary,checks)
        self.assertEqual(updated[0]["priority"],"high")
        self.assertIn("pmqc_anp_geoposition_divergence",updated[0]["flags"])
        self.assertIn("pmqc_anp_geoposition_divergence",items[0]["geoAudit"]["reasons"])
        self.assertEqual(geo_summary["priorityQueue"]["high"],1)
        self.assertFalse(updated[0]["manualReviewApproved"])
        self.assertEqual(geo_summary["manuallyApproved"],0)

    def test_missing_samples_and_missing_registry_location(self):
        reg={CNPJ:{"city":"ARARAQUARA"}}
        with_coordinates=parse_pmqc_csv(pmqc_bytes(laboratory()),reg,NOW)
        checks,summary=compare_pmqc_positions(catalog(lat=None,lng=None),with_coordinates)
        self.assertEqual(checks[CNPJ]["status"],"registry_without_coordinates")
        self.assertEqual(summary["registryWithoutCoordinates"],1)
        without_coordinates=parse_pmqc_csv(pmqc_bytes(laboratory(lat="",lng="")),reg,NOW)
        checks,summary=compare_pmqc_positions(catalog(),without_coordinates)
        self.assertEqual(checks[CNPJ]["status"],"pmqc_without_coordinates")
        self.assertEqual(summary["pmqcWithoutCoordinates"],1)

    def test_invalid_latitude_outside_city_is_not_trusted(self):
        reg={CNPJ:{"city":"ARARAQUARA"}}
        evidence=parse_pmqc_csv(pmqc_bytes(laboratory(lat="-23.2",lng="-45.9")),reg,NOW)
        self.assertEqual(evidence[CNPJ]["samples"][0]["reportedGeoPositions"],[])
        checks,summary=compare_pmqc_positions(catalog(),evidence)
        self.assertEqual(summary["comparableStations"],0)

    def test_conflicting_coordinates_within_sample_are_not_ignored(self):
        reg={CNPJ:{"city":"ARARAQUARA"}}
        evidence=parse_pmqc_csv(pmqc_bytes(
            laboratory(lat="-21.8",lng="-48.18"),
            laboratory(lat="-21.81",lng="-48.19",test="Outro Ensaio")
        ),reg,NOW)
        self.assertTrue(evidence[CNPJ]["samples"][0]["geoPositionsConflictWithinSample"])
        _,summary=compare_pmqc_positions(catalog(),evidence)
        self.assertEqual(summary["conflictingPositionsWithinSample"],1)

    def test_two_sources_can_be_same_agency_and_are_never_independent_validation(self):
        evidence=parse_pmqc_csv(pmqc_bytes(laboratory()),{CNPJ:{"city":"ARARAQUARA"}},NOW)
        item=catalog()
        checks,_=compare_pmqc_positions(item,evidence)
        self.assertNotIn("verifiedOnSite",checks[CNPJ])
        self.assertFalse(checks[CNPJ]["manualReviewApproved"])
        self.assertEqual(item[0]["geoAudit"]["manualReviewApproved"],False)

if __name__=="__main__":
    unittest.main()
