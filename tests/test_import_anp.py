import io
import json
from pathlib import Path
import tempfile
import unittest
from types import SimpleNamespace

from import_anp import (
    csv_rows, xlsx_rows, parse_rows, has_city_coordinate, geocode, run
)

RECORD = {
    "Municipio": "SAO JOSE DOS CAMPOS",
    "Estado - Sigla": "SP",
    "CNPJ da Revenda": "12.345.678/0001-90",
    "Revenda": "AUTO POSTO DE EXEMPLO LTDA",
    "Produto": "GASOLINA",
    "Valor de Venda": "5,99",
    "Data da Coleta": "09/10/2026",
    "Nome da Rua": "AVENIDA IGUAPE",
    "Numero Rua": "20",
    "Bairro": "CIDADE JARDIM"
}

class ImportAnpTest(unittest.TestCase):
    def test_parses_price_without_inventing_other_fuels(self):
        p = parse_rows([RECORD])[0]
        self.assertEqual(p["prices"], {"gas": 5.99})
        self.assertEqual(p["collectedAtByFuel"]["gas"], "2026-10-09")
        self.assertEqual(p["source"], "ANP - levantamento semanal")
        self.assertEqual(p["cnpj"], "12345678000190")

    def test_rejects_missing_date_or_fake_price(self):
        bad = {**RECORD, "Data da Coleta": "", "Valor de Venda": "5,99"}
        bad2 = {**RECORD, "Valor de Venda": "0,02"}
        self.assertEqual(parse_rows([bad, bad2]), [])

    def test_parses_utf8_csv(self):
        csv_content = ("Municipio;Estado - Sigla;CNPJ da Revenda;Revenda;Produto;"
                       "Valor de Venda;Data da Coleta;Nome da Rua;Numero Rua;Bairro\n"
                       "SAO JOSE DOS CAMPOS;SP;12.345.678/0001-90;"
                       "AUTO POSTO DE EXEMPLO LTDA;GASOLINA;5,99;09/10/2026;"
                       "AVENIDA IGUAPE;20;CIDADE JARDIM\n")
        result = parse_rows(csv_rows(csv_content.encode("utf-8")))
        self.assertEqual(len(result), 1)

    def test_parses_excel(self):
        from openpyxl import Workbook
        wb = Workbook()
        sheet = wb.active
        sheet.append(list(RECORD.keys()))
        sheet.append(list(RECORD.values()))
        out = io.BytesIO()
        wb.save(out)
        result = parse_rows(xlsx_rows(out.getvalue()))
        self.assertEqual(result[0]["prices"]["gas"], 5.99)

    def test_location_boundaries(self):
        self.assertTrue(has_city_coordinate("SAO JOSE DOS CAMPOS", -23.2, -45.9))
        self.assertFalse(has_city_coordinate("SAO JOSE DOS CAMPOS", -21.8, -48.2))

    def test_null_cache_entry_does_not_crash(self):
        station = {"cnpj": "12345678000190", "city": "SAO JOSE DOS CAMPOS"}
        self.assertIsNone(geocode(station, {station["cnpj"]: None}, None))

    def test_never_overwrite_old_data_if_no_locations(self):
        csv_content = ("Municipio;Estado - Sigla;CNPJ da Revenda;Revenda;Produto;"
                       "Valor de Venda;Data da Coleta;Nome da Rua;Numero Rua;Bairro\n"
                       "SAO JOSE DOS CAMPOS;SP;12.345.678/0001-90;"
                       "AUTO POSTO DE EXEMPLO LTDA;GASOLINA;5,99;09/10/2026;"
                       "AVENIDA IGUAPE;20;CIDADE JARDIM\n")
        with tempfile.TemporaryDirectory() as tmp:
            f = Path(tmp) / "anp.csv"
            f.write_text(csv_content, encoding="utf-8")
            output = Path(tmp) / "dados.json"
            output.write_text('[{"unchanged":true}]', encoding="utf-8")
            args = SimpleNamespace(arquivo=str(f), cache=str(Path(tmp)/"cache.json"),
                                   output=str(output), geocode=False, max_geocode=0)
            with self.assertRaisesRegex(RuntimeError, "Sem postos mapeáveis"):
                run(args)
            self.assertEqual(json.loads(output.read_text(encoding="utf-8")),
                             [{"unchanged": True}])

if __name__ == "__main__":
    unittest.main()
