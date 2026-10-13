import unittest
from datetime import datetime, timezone

from geo_audit import audit_catalog, haversine_m, parse_anp_date

NOW = datetime(2026, 10, 12, 12, tzinfo=timezone.utc)

def station(cnpj, lat=-21.80, lng=-48.18, validated=False, obtained="10/10/2026", city="ARARAQUARA"):
    return {
        "cnpj": cnpj, "name": "POSTO TESTE " + cnpj[-2:],
        "address": "RUA TESTE 100", "city": city,
        "lat": lat, "lng": lng,
        "geoSource": "ANP - API Revendedores",
        "geoValidation": "Posição Geográfica validada" if validated else "Posição Geográfica não validada",
        "geoDate": obtained, "prices": {}
    }

class GeoAuditTest(unittest.TestCase):
    def test_missing_coordinate_is_queue_only_not_automatically_approved(self):
        catalog, review, status = audit_catalog([
            station("12345678000190", lat=None, lng=None)
        ], now=NOW)
        self.assertEqual(status["missingCoordinates"], 1)
        self.assertEqual(status["reviewRequired"], 1)
        self.assertIn("coordinates_missing_or_out_of_area", review[0]["flags"])
        self.assertFalse(catalog[0]["geoAudit"]["manualReviewApproved"])

    def test_nonvalidated_anp_position_needs_manual_review(self):
        catalog, review, status = audit_catalog([
            station("12345678000190")
        ], now=NOW)
        self.assertEqual(len(review),1)
        self.assertIn("anp_position_not_validated",review[0]["flags"])
        self.assertEqual(catalog[0]["geoAudit"]["anpValidation"],"not_validated")
        self.assertEqual(status["manuallyApproved"],0)

    def test_close_coordinates_different_cnpj_are_flagged_but_not_rejected(self):
        x=station("12345678000190",validated=True)
        y=station("12345678000191",lat=-21.80001,lng=-48.18001,validated=True)
        catalog,review,status=audit_catalog([x,y],now=NOW)
        self.assertEqual(status["withCoordinates"],2)
        self.assertEqual(status["flagCounts"]["near_another_cnpj"],2)
        self.assertTrue(all("near_another_cnpj" in row["flags"] for row in review))
        self.assertTrue(all(row["geoAudit"]["nearbyOtherCnpjs"] for row in catalog))

    def test_legitimate_separate_stations_not_flagged_as_duplicate(self):
        x=station("12345678000190",validated=True)
        y=station("12345678000191",lat=-21.805,lng=-48.19,validated=True)
        catalog, review, status=audit_catalog([x,y],now=NOW)
        self.assertEqual(review,[])
        self.assertEqual(status["automatedChecksPassed"],2)
        # Passing these checks still must not claim the station was verified onsite.
        self.assertFalse(catalog[0]["geoAudit"]["manualReviewApproved"])

    def test_old_geo_date_and_invalid_future_date_are_review_flags(self):
        a=station("12345678000190",validated=True,obtained="15/09/2020")
        b=station("12345678000191",validated=True,obtained="23/12/2026",lat=-21.83,lng=-48.20)
        _,queue,s=audit_catalog([a,b],now=NOW)
        self.assertEqual(len(queue),2)
        self.assertEqual(s["flagCounts"]["geo_observation_old"],1)
        self.assertEqual(s["flagCounts"]["geo_date_in_future"],1)

    def test_unavailable_or_out_of_city_never_approved(self):
        a=station("12345678000190",city="ARARAQUARA",lat=-23.2,lng=-45.9,validated=True)
        catalog,queue,s=audit_catalog([a],now=NOW)
        self.assertEqual(s["missingCoordinates"],1)
        self.assertEqual(catalog[0]["geoAudit"]["anpValidation"],"unavailable")

    def test_duplicate_cnpj_fails_audit(self):
        with self.assertRaisesRegex(ValueError,"duplicado"):
            audit_catalog([station("12345678000190"),station("12345678000190")],now=NOW)

    def test_does_not_mutate_catalog_and_is_repeatable(self):
        original=station("12345678000190")
        audit_catalog([original],now=NOW)
        self.assertNotIn("geoAudit",original)
        one=audit_catalog([original],now=NOW)
        two=audit_catalog([original],now=NOW)
        self.assertEqual(one,two)

    def test_distance_and_anp_date_conversion(self):
        self.assertAlmostEqual(haversine_m({"lat":-21.8,"lng":-48.18},
                                           {"lat":-21.8,"lng":-48.18}),0)
        self.assertEqual(parse_anp_date("07/10/2026").isoformat(),"2026-10-07")
        self.assertEqual(parse_anp_date("2026-10-07").isoformat(),"2026-10-07")
        self.assertIsNone(parse_anp_date("não informado"))

if __name__=="__main__":
    unittest.main()
