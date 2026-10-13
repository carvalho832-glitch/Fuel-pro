import io
import json
from datetime import datetime, timezone
from pathlib import Path
import tempfile
import unittest

from openpyxl import Workbook

from engine_anp import (
    response_stations, join_prices, update_history, build, anp_registry
)

CNPJ = "12345678000190"
CNPJ2 = "99887766000122"

def station(cnpj=CNPJ, collected="2026-10-09"):
    return {
        "cnpj": cnpj, "name":"AUTO POSTO TESTE", "city":"ARARAQUARA",
        "source":"ANP - levantamento semanal", "prices":{"gas": 5.99, "eta": 3.89},
        "collectedAtByFuel":{"gas": collected, "eta":collected}
    }

def registry(cnpj=CNPJ, lat=-21.8, lng=-48.18):
    return {cnpj: {
        "city": "ARARAQUARA", "name": "AUTO POSTO TESTE", "address": "RUA EXEMPLO 100",
        "district": "CENTRO", "brand": "BANDEIRA BRANCA",
        "lat": lat, "lng": lng, "geoValidation": "Posição Geográfica não validada",
        "geoSource": "ANP - API Revendedores",
    }}

def make_xlsx():
    wb=Workbook()
    sheet=wb.active
    sheet.append(["CNPJ", "RAZÃO", "ENDEREÇO", "NÚMERO", "BAIRRO", "MUNICÍPIO",
                  "ESTADO", "PRODUTO", "PREÇO DE REVENDA", "DATA DA COLETA"])
    sheet.append([CNPJ, "AUTO POSTO TESTE", "RUA EXEMPLO", "100", "CENTRO",
                  "ARARAQUARA", "SÃO PAULO", "GASOLINA COMUM", 5.99, "09/10/2026"])
    out=io.BytesIO()
    wb.save(out)
    return out.getvalue()

class EngineTest(unittest.TestCase):
    def setUp(self):
        self.today = datetime(2026,10,12,tzinfo=timezone.utc)

    def test_map_cnpj_joins_source_and_date(self):
        posts, issues = join_prices([station()], registry(), now=self.today)
        self.assertEqual(len(posts),1)
        self.assertEqual(posts[0]["cnpj"],CNPJ)
        self.assertEqual(posts[0]["prices"],{"gas":5.99,"eta":3.89})
        self.assertEqual(posts[0]["source"],"ANP - levantamento semanal")
        self.assertEqual(posts[0]["locationPrecision"],"approximate")
        self.assertFalse(posts[0]["locationValidated"])
        self.assertEqual(issues["withoutCoordinates"],[])

    def test_no_coor_no_price_on_map(self):
        posts, issues=join_prices([station()], registry(lat=None,lng=None), now=self.today)
        self.assertEqual(posts,[])
        self.assertEqual(issues["withoutCoordinates"],[CNPJ])

    def test_no_registry_match_no_map(self):
        posts, issues=join_prices([station()],registry(cnpj=CNPJ2),now=self.today)
        self.assertEqual(posts,[])
        self.assertEqual(issues["withoutRegistry"],[CNPJ])

    def test_outdated_prices_not_shown(self):
        posts, issues=join_prices([station(collected="2026-08-01")],registry(),now=self.today)
        self.assertEqual(posts,[])
        self.assertEqual(issues["excludedStaleFuelObservations"],2)

    def test_history_is_idempotent_by_cnpj_fuel_date(self):
        observation={"cnpj":CNPJ, "fuel":"gas", "price":5.99,"collectedAt":"2026-10-02"}
        history=update_history([observation],[observation,observation])
        self.assertEqual(len(history),1)
        nextweek={**observation,"collectedAt":"2026-10-09"}
        self.assertEqual(len(update_history(history,[nextweek])),2)

    def test_api_refuses_unsuccessful_response(self):
        with self.assertRaises(ValueError):
            response_stations({"succeeded":False,"data":[]})
        with self.assertRaises(ValueError):
            response_stations({"succeeded":True,"data":[],"searchPageFilter":{"totalPages":2}})

    def test_full_xlsx_pipeline(self):
        posts,hist,status=build(make_xlsx(),registry(),{"ARARAQUARA":63},now=self.today)
        self.assertEqual(status["stationsWithPrices"],1)
        self.assertEqual(status["stationsWithCoordinatesAndPrices"],1)
        self.assertEqual(status["mappedStationsByCity"]["ARARAQUARA"],1)
        self.assertEqual(status["mappedStationsByCity"]["SAO JOSE DOS CAMPOS"],0)
        self.assertTrue(status["hasStagingCandidates"])
        self.assertFalse(status["publicationApproved"])
        self.assertEqual(status["geolocationsNotValidated"],1)
        self.assertEqual(status["historyObservations"],1)
        self.assertEqual(posts[0]["prices"]["gas"],5.99)
        self.assertEqual(hist[0]["collectedAt"],"2026-10-09")


    def test_history_recovers_latest_per_fuel_without_fabrication(self):
        from engine_anp import recent_stations_from_history
        hist = [
            {"cnpj": CNPJ, "fuel": "gas", "price": 5.99, "collectedAt":"2026-09-28", "source":"ANP - levantamento semanal"},
            {"cnpj": CNPJ, "fuel": "gas", "price": 6.05, "collectedAt":"2026-10-09", "source":"ANP - levantamento semanal"},
            {"cnpj": CNPJ, "fuel": "eta", "price": 4.04, "collectedAt":"2026-10-01", "source":"ANP - levantamento semanal"},
        ]
        posts = recent_stations_from_history(hist, registry(), now=self.today)
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0]["prices"], {"gas":6.05, "eta":4.04})
        self.assertEqual(posts[0]["collectedAtByFuel"], {"gas":"2026-10-09", "eta":"2026-10-01"})

    def test_history_never_exposes_old_prices(self):
        from engine_anp import recent_stations_from_history
        hist = [
            {"cnpj":CNPJ,"fuel":"gas","price":5.99,"collectedAt":"2026-08-01","source":"ANP - levantamento semanal"}
        ]
        self.assertEqual(recent_stations_from_history(hist, registry(), now=self.today), [])

    def test_historical_week_can_recover_a_post_missing_from_latest_week(self):
        older = {
            "cnpj": CNPJ, "fuel":"gas", "price":6.39,
            "collectedAt":"2026-10-02", "source":"ANP - levantamento semanal"
        }
        posts, hist, status = build(make_xlsx(), registry(), {"ARARAQUARA":63},
            previous_history=[older], now=self.today)
        self.assertEqual(posts[0]["prices"]["gas"],5.99)
        self.assertEqual(status["historyObservations"],2)
        self.assertEqual(status["mappedStationsByCity"]["ARARAQUARA"],1)

    def test_archive_link_discovery_blocks_untrusted_hosts(self):
        from anp_history import recent_official_links
        html = """
          <a href="https://evil.example/fake.xlsx">Preços por posto revendedor</a>
          <a href="/anp/arquivos/2026/week1.xlsx">Preços por posto revendedor (combustíveis)</a>
          <a href="/anp/arquivos/2026/week2.xlsx">Preços por posto revendedor (combustíveis)</a>
          <a href="/anp/arquivos/2026/week3.xlsx">Preços médios semanais</a>
        """
        found = recent_official_links(html, limit=2)
        self.assertEqual(len(found),2)
        self.assertTrue(all(x.startswith("https://www.gov.br/") for x in found))
        with self.assertRaises(ValueError):
            recent_official_links(html,limit=50)

    def test_geodata_bounds_reject_outside_city(self):
        class FakeResponse:
            def raise_for_status(self): pass
            def json(self): return {"succeeded":True, "data":[{
                "cnpj":CNPJ, "municipio":"ARARAQUARA", "uf":"SP",
                "latitude":"-23.22", "longitude":"-45.90", "razaoSocial":"POSTO"
            }]}
        class FakeSession:
            headers={}
            def get(self, *a, **kw): return FakeResponse()
        result, counts=anp_registry(["ARARAQUARA"],FakeSession())
        self.assertIsNone(result[CNPJ]["lat"])
        self.assertEqual(counts["ARARAQUARA"],1)

if __name__=="__main__":
    unittest.main()
