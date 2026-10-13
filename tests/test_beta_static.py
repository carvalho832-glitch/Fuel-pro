"""Testes offline do pacote estático Fuel Pro Beta."""
import json
from datetime import datetime, date
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[1]
FOLDER=ROOT/"beta"

class BetaStaticTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=json.loads((FOLDER/"dados.json").read_text(encoding="utf-8"))
        cls.stations=cls.data["stations"]

    def test_validated_envelope_and_sources(self):
        d=self.data
        self.assertTrue(d["beta"])
        self.assertTrue(d["homologationOnly"])
        self.assertFalse(d["approval"]["publicationApproved"])
        self.assertEqual(d["approval"]["coordinatesVerifiedOnSite"],0)
        self.assertTrue(d["sources"]["prices"].startswith("https://www.gov.br/anp/"))
        self.assertEqual(d["sources"]["registry"],"https://revendedoresapi.anp.gov.br/v1/combustivel")

    def test_map_snapshot_counts(self):
        count = self.data["counts"]
        self.assertGreater(len(self.stations), 0)
        self.assertEqual(len(self.stations), count["registered"])
        self.assertEqual(len({p["cnpj"] for p in self.stations}), len(self.stations))
        self.assertEqual(sum(p["mapEligible"] for p in self.stations), count["mapEligible"])
        self.assertEqual(sum(not p["mapEligible"] for p in self.stations), count["withoutCoords"])
        self.assertEqual(sum(bool(p["prices"]) for p in self.stations), count["withRecentPrice"])
        self.assertEqual(sum(p["pmqc"] is not None for p in self.stations), count["withLabSamples"])
        self.assertEqual(sum(p["city"] in ("ARARAQUARA","SAO JOSE DOS CAMPOS") for p in self.stations), len(self.stations))

    def test_no_fabricated_prices(self):
        approved_fuels={"gas","gas_ad","eta","eta_ad","die","die_s10","gnv"}
        for p in self.stations:
            with self.subTest(cnpj=p["cnpj"]):
                self.assertRegex(p["cnpj"],r"^\d{14}$")
                self.assertFalse(p["geoValidated"])
                self.assertFalse(p["geoAudit"]["manualReviewApproved"])
                self.assertIsNone(p["fuelScoreOverall"])
                self.assertTrue(set(p["prices"]).issubset(approved_fuels))
                self.assertEqual(set(p["prices"]),set(p["collectedAtByFuel"]))
                if p["prices"]:
                    self.assertEqual(p["source"],"ANP - levantamento semanal")
                    self.assertEqual(p["priceStatus"],"historical_observation")
                    for fuel,number in p["prices"].items():
                        self.assertTrue(0.5<number<30)
                        date.fromisoformat(p["collectedAtByFuel"][fuel])
                else:
                    self.assertEqual(p["priceStatus"],"not_available")
                    self.assertIsNone(p["source"])
                if p["mapEligible"]:
                    self.assertIsInstance(p["lat"],(float,int))
                    self.assertIsInstance(p["lng"],(float,int))
                else:
                    self.assertIsNone(p["lat"])
                    self.assertIsNone(p["lng"])

    def test_pmqc_samples_do_not_become_station_quality_certification(self):
        for p in self.stations:
            if p["pmqc"]:
                self.assertGreater(p["pmqc"]["sampleCount"],0)
                self.assertGreaterEqual(p["pmqc"]["samplesWithNonconformity"],0)
                self.assertLessEqual(p["pmqc"]["samplesWithNonconformity"],p["pmqc"]["sampleCount"])
                date.fromisoformat(p["pmqc"]["latestSampleAt"])

    def test_public_beta_not_using_google_maps_platform(self):
        js=(FOLDER/"app.js").read_text(encoding="utf-8")
        html=(FOLDER/"index.html").read_text(encoding="utf-8")
        self.assertIn("tile.openstreetmap.org",js)
        self.assertIn("OpenStreetMap contributors",js)
        self.assertNotIn("maps.googleapis.com",js+html)
        self.assertNotIn("places.googleapis.com",js+html)
        self.assertNotIn("openRoute",js)
        self.assertIn('robots',html.lower() if 'robots' in html.lower() else (FOLDER/"robots.txt").read_text().lower())
        self.assertIn("manualReviewApproved",js)
        self.assertIn('beta',html.lower())

if __name__=="__main__":
    unittest.main()
