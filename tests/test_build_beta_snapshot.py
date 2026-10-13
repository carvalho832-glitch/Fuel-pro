"""O construtor Beta pode receber amostras reais sem violar integridade."""
import copy
from datetime import datetime, timezone
import json
from pathlib import Path
import tempfile
import unittest

from build_beta_snapshot import build_snapshot, write_snapshot

ROOT = Path(__file__).resolve().parents[1]
NOW = datetime(2026, 10, 13, 13, tzinfo=timezone.utc)


class BetaBuilderTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = json.loads((ROOT/"data/catalogo_postos_anp.json").read_text(encoding="utf-8"))
        cls.status = json.loads((ROOT/"data/engine_status.json").read_text(encoding="utf-8"))
        cls.pmqc = json.loads((ROOT/"data/pmqc_evidencias_anp.json").read_text(encoding="utf-8"))

    def build(self, catalog=None, status=None, pmqc=None, now=None):
        source_status = self.status if status is None else status
        if now is None:
            now = datetime.fromisoformat(source_status["generatedAt"])
        return build_snapshot(
            self.catalog if catalog is None else catalog,
            source_status,
            self.pmqc if pmqc is None else pmqc, now
        )

    def test_build_official_beta_only(self):
        data=self.build()
        self.assertEqual(data["counts"]["registered"],len(self.catalog))
        self.assertEqual(data["counts"]["mapEligible"],self.status["catalogWithCoordinates"])
        self.assertEqual(data["counts"]["withRecentPrice"],sum(bool(p["prices"]) for p in data["stations"]))
        self.assertEqual(data["counts"]["withLabSamples"],len(self.pmqc))
        self.assertEqual(data["counts"]["withoutCoords"],len(self.catalog)-self.status["catalogWithCoordinates"])
        self.assertFalse(data["approval"]["publicationApproved"])
        self.assertEqual(data["approval"]["coordinatesVerifiedOnSite"],0)
        self.assertTrue(data["homologationOnly"])
        self.assertTrue(all(p["fuelScoreOverall"] is None for p in data["stations"]))
        self.assertTrue(all(p["geoAudit"]["manualReviewApproved"] is False for p in data["stations"]))
        self.assertTrue(all("geoRecordedAt" in p for p in data["stations"]))
        self.assertTrue(all(p["geoRecordedAt"] is None for p in data["stations"] if not p["mapEligible"]))

    def test_snapshot_is_deterministic_for_same_inputs(self):
        self.assertEqual(self.build(),self.build())
        self.assertNotEqual(self.build()["snapshotId"], "nao-real")

    def test_stale_price_disappears_not_fabricated(self):
        old=self.build(now=datetime(2027, 3, 15, tzinfo=timezone.utc))
        self.assertEqual(old["counts"]["withRecentPrice"],0)
        self.assertTrue(all(not p["prices"] for p in old["stations"]))
        self.assertEqual(old["counts"]["registered"],len(self.catalog))
        self.assertEqual(old["counts"]["withLabSamples"],len(self.pmqc))

    def test_reject_untrusted_price_source(self):
        status=copy.deepcopy(self.status)
        status["priceSource"]="https://site-falso.net/precos"
        with self.assertRaisesRegex(ValueError,"preço"):
            self.build(status=status)

    def test_reject_preapproved_locations_or_reputation(self):
        catalog=copy.deepcopy(self.catalog)
        catalog[0]["geoAudit"]["manualReviewApproved"]=True
        with self.assertRaisesRegex(ValueError,"Auditoria"):
            self.build(catalog=catalog)
        catalog=copy.deepcopy(self.catalog)
        catalog[0]["fuelScore"]["overallScore"]=4.9
        with self.assertRaisesRegex(ValueError,"Nota"):
            self.build(catalog=catalog)

    def test_reject_catalog_mismatch_and_duplicate_cnpj(self):
        short=self.catalog[:1]
        with self.assertRaisesRegex(ValueError,"Contagem"):
            self.build(catalog=short)
        duplicate=copy.deepcopy(self.catalog)
        duplicate[1]["cnpj"]=duplicate[0]["cnpj"]
        with self.assertRaisesRegex(ValueError,"duplicado"):
            self.build(catalog=duplicate)

    def test_does_not_expose_precise_location_for_missing_coordinates(self):
        data=self.build()
        none=[p for p in data["stations"] if not p["mapEligible"]]
        self.assertEqual(len(none),len(self.catalog)-self.status["catalogWithCoordinates"])
        self.assertTrue(all(p["lat"] is None and p["lng"] is None for p in none))

    def test_write_snapshot_with_strict_data(self):
        with tempfile.TemporaryDirectory() as td:
            out=Path(td)/"beta.json"
            result=write_snapshot(
                ROOT/"data/catalogo_postos_anp.json",
                ROOT/"data/engine_status.json",
                ROOT/"data/pmqc_evidencias_anp.json",
                out, datetime.fromisoformat(self.status["generatedAt"])
            )
            self.assertEqual(json.loads(out.read_text(encoding="utf-8")),result)
            self.assertEqual(result["release"],"fuel-pro-anp-beta-2")

if __name__=="__main__":
    unittest.main()
