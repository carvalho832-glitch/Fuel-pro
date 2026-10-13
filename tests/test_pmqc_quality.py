import unittest
from datetime import datetime, timezone

from pmqc_quality import parse_pmqc_csv, OFFICIAL_PMQC_URL

CNPJ_A = "12345678000190"
CNPJ_B = "99887766000122"
NOW = datetime(2026, 10, 12, tzinfo=timezone.utc)

HEADER = "DataColeta;IdNumeric;GrupoProduto;Produto;RazaoSocialPosto;CnpjPosto;Distribuidora;Endereço;Complemento;Bairro;Município;Latitude;Longitude;Uf;RegiaoPolitica;Ensaio;Resultado;UnidadeEnsaio;Conforme"

def record(date, sample, cnpj, city, assay, result, product="GASOLINA C COMUM", uf="SP"):
    return ";".join([
        date, sample, "Gasolina", product, "POSTO TESTE", cnpj,
        "BANDEIRA BRANCA", "RUA TESTE", "", "CENTRO", city,
        "-21.8", "-48.2", uf, "SUDESTE", assay, "20", "%", result
    ])

REGISTRY = {
    CNPJ_A: {"city": "ARARAQUARA"},
    CNPJ_B: {"city": "SAO JOSE DOS CAMPOS"}
}

class PMQCTest(unittest.TestCase):
    def parse(self, rows):
        binary = (HEADER + "\n" + "\n".join(rows) + "\n").encode("utf-8")
        return parse_pmqc_csv(binary, REGISTRY, NOW)

    def test_group_multiple_assays_into_one_lab_sample(self):
        r = self.parse([
            record("2026-09-01", "1058333", CNPJ_A, "ARARAQUARA", "Destilação - 50%", "Sim"),
            record("2026-09-01", "1058333", CNPJ_A, "ARARAQUARA", "Teor de Etanol", "Sim")
        ])[CNPJ_A]
        self.assertEqual(r["sampleCount"], 1)
        self.assertEqual(r["samples"][0]["reportedAssayCount"], 2)
        self.assertEqual(r["samplesWithAllReportedAssaysConforming"], 1)
        self.assertIsNone(r["rating"])
        self.assertFalse(r["certifiesCurrentQuality"])

    def test_one_nonconforming_assay_does_not_turn_into_permanent_station_label(self):
        r = self.parse([
            record("2026-09-01", "1058333", CNPJ_A, "ARARAQUARA", "Ensaio A", "Sim"),
            record("2026-09-01", "1058333", CNPJ_A, "ARARAQUARA", "Ensaio B", "Não")
        ])[CNPJ_A]
        self.assertEqual(r["samplesWithNonconformity"], 1)
        self.assertEqual(r["samples"][0]["status"], "nonconformity_reported")
        self.assertEqual(r["status"], "laboratory_samples_found")
        self.assertIsNone(r["rating"])

    def test_duplicate_test_lines_are_not_duplicated(self):
        a = record("2026-09-01", "1058333", CNPJ_A, "ARARAQUARA", "Ensaio A", "Sim")
        r = self.parse([a,a])[CNPJ_A]
        self.assertEqual(r["sampleCount"], 1)
        self.assertEqual(r["samples"][0]["reportedAssayCount"], 1)

    def test_wrong_city_or_uf_prevents_cnpj_misattribution(self):
        r = self.parse([
            record("2026-09-01", "1", CNPJ_A, "SAO JOSE DOS CAMPOS", "Ensaio", "Não"),
            record("2026-09-01", "2", CNPJ_A, "ARARAQUARA", "Ensaio", "Não", uf="MG")
        ])
        self.assertEqual(r,{})

    def test_other_company_not_added(self):
        self.assertEqual(self.parse([
            record("2026-09-01", "1", "55555555000199", "ARARAQUARA", "Ensaio", "Sim")
        ]),{})

    def test_future_sample_is_discarded(self):
        self.assertEqual(self.parse([
            record("2026-12-01", "1", CNPJ_A, "ARARAQUARA", "Ensaio", "Sim")
        ]),{})

    def test_reject_fake_schema_or_untrusted_source(self):
        with self.assertRaisesRegex(ValueError, "Cabeçalhos"):
            parse_pmqc_csv(b"empresa;status\nabc;OK", REGISTRY, NOW)
        with self.assertRaisesRegex(ValueError, "Fonte"):
            parse_pmqc_csv((HEADER+"\n").encode("utf-8"),REGISTRY,NOW,"https://example.org/fake.csv")

if __name__ == "__main__":
    unittest.main()
