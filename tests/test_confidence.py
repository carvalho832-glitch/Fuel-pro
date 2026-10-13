import unittest
from datetime import datetime, timezone

from fuel_confidence import (
    PRICE_SOURCE, REGISTRY_SOURCE,
    evidence_profile, price_evidence, geo_status, build_station_catalog
)

NOW = datetime(2026, 10, 12, 15, tzinfo=timezone.utc)
CNPJ_A = "12345678000190"
CNPJ_B = "12345678000191"

def registry_record(name="POSTO EXEMPLO", cnpj=CNPJ_A, city="ARARAQUARA",
                    lat=-21.8, lng=-48.18, validation="Posição Geográfica não validada"):
    return {
        "cnpj": cnpj, "name": name,
        "address": "RUA EXEMPLO, 100", "district": "CENTRO",
        "city": city, "brand": "BANDEIRA BRANCA",
        "lat": lat, "lng": lng, "geoValidation": validation,
        "geoSource": REGISTRY_SOURCE
    }

class ConfidenceTest(unittest.TestCase):
    def test_recent_official_price_shows_age_but_not_live_confirmation(self):
        result = price_evidence(5.99, "2026-10-10", PRICE_SOURCE, NOW)
        self.assertTrue(result["available"])
        self.assertEqual(result["ageDays"], 2)
        self.assertEqual(result["freshness"], "up_to_3_days")
        self.assertFalse(result["confirmedAtPump"])
        self.assertFalse(result["isLive"])

    def test_stale_price_has_date_but_not_published_as_available(self):
        result = price_evidence(5.99, "2026-09-01", PRICE_SOURCE, NOW)
        self.assertFalse(result["available"])
        self.assertEqual(result["freshness"], "over_30_days")

    def test_fake_or_missing_source_never_validated(self):
        self.assertFalse(price_evidence(5.99, "2026-10-10", "outro site", NOW)["available"])
        self.assertFalse(price_evidence(5.99, None, PRICE_SOURCE, NOW)["available"])
        self.assertFalse(price_evidence(0, "2026-10-10", PRICE_SOURCE, NOW)["available"])
        self.assertFalse(price_evidence(5.99, "2026-11-01", PRICE_SOURCE, NOW)["available"])

    def test_geo_status_does_not_approve_unvalidated_coordinates(self):
        self.assertEqual(geo_status(registry_record()), "not_validated")
        self.assertEqual(geo_status(registry_record(validation="Posição Geográfica validada")), "validated")
        self.assertEqual(geo_status(registry_record(lat=None,lng=None)), "unavailable")
        self.assertEqual(geo_status(registry_record(city="SAO JOSE DOS CAMPOS",lat=-21.8,lng=-48.18)), "unavailable")

    def test_station_never_has_invented_quality_or_stars(self):
        reg = registry_record()
        reg.update({
            "source": PRICE_SOURCE, "prices": {"gas":5.99},
            "collectedAtByFuel":{"gas":"2026-10-09"}
        })
        result = evidence_profile(reg, NOW)
        self.assertEqual(result["location"]["status"], "not_validated")
        self.assertIsNone(result["quality"]["rating"])
        self.assertIsNone(result["quality"]["laboratoryEvidence"])
        self.assertIsNone(result["community"]["rating"])
        self.assertIsNone(result["overallScore"])
        self.assertFalse(result["priceEvidenceByFuel"]["gas"]["isLive"])

    def test_full_catalog_keeps_post_without_price_and_no_fake_coords(self):
        ra=registry_record()
        rb=registry_record("OUTRO POSTO",CNPJ_B,"SAO JOSE DOS CAMPOS",None,None)
        mapped=[{
            "cnpj":CNPJ_A,"prices":{"gas":5.99},
            "collectedAtByFuel":{"gas":"2026-10-09"}
        }]
        catalog=build_station_catalog({CNPJ_A:ra,CNPJ_B:rb},mapped,NOW)
        self.assertEqual(len(catalog), 2)
        first=next(s for s in catalog if s["cnpj"]==CNPJ_A)
        second=next(s for s in catalog if s["cnpj"]==CNPJ_B)
        self.assertTrue(first["mapEligible"])
        self.assertEqual(first["priceStatus"], "historical_observation")
        self.assertEqual(first["fuelScore"]["priceEvidenceByFuel"]["gas"]["ageDays"], 3)
        self.assertEqual(second["priceStatus"], "not_available")
        self.assertFalse(second["mapEligible"])
        self.assertEqual(second["prices"], {})
        self.assertEqual(second["collectedAtByFuel"], {})
        self.assertEqual(second["fuelScore"]["priceEvidenceByFuel"], {})
        self.assertIsNone(second["fuelScore"]["quality"]["rating"])

    def test_catalog_fulfills_unique_cnpj_and_does_not_invent_city_pricing(self):
        stations={
            CNPJ_A:registry_record(),
            CNPJ_B:registry_record("POSTO B", CNPJ_B, "SAO JOSE DOS CAMPOS",-23.2,-45.9)
        }
        catalog=build_station_catalog(stations, [], NOW)
        self.assertEqual({s["cnpj"] for s in catalog},set(stations))
        self.assertTrue(all(s["priceStatus"]=="not_available" for s in catalog))
        self.assertTrue(all(s["fuelScore"]["overallScore"] is None for s in catalog))

if __name__ == "__main__":
    unittest.main()
