import unittest
from fetch_pmqc import (
    official_monthly_urls, download_month, download_latest, valid_month_url,
    BASE_URL, INDEX_URL
)
from pmqc_quality import MAX_PMQC_BYTES

HEADER = b"DataColeta;IdNumeric;Produto;CnpjPosto;Munic\xc3\xadpio;Uf;Ensaio;Conforme\n"

class Response:
    def __init__(self, body, status=200, url=None):
        self.body, self.status_code, self.url = body, status, url
        self.text = body.decode("utf-8", errors="replace")
    def raise_for_status(self):
        if self.status_code != 200:
            from requests import HTTPError
            raise HTTPError(f"{self.status_code} error")
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def iter_content(self, chunk_size=None):
        yield self.body

class Session:
    def __init__(self, responses):
        self.responses = responses
        self.headers = {}
        self.calls = []
    def get(self, url, **kwargs):
        self.calls.append(url)
        return self.responses.get(url, Response(b"not found", 404, url))

class PMQCFetchTest(unittest.TestCase):
    def test_discover_latest_official_csv_only(self):
        html = '''
          <a href="https://evil.test/pmqc_2099_01.csv">CSV fraudulento</a>
          <a href="/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/pmqc/2026/pmqc_2026_08.csv">ago</a>
          <a href="/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/pmqc/2026/pmqc_2026_09.csv">set</a>
        '''
        found=official_monthly_urls(html,limit=2)
        self.assertEqual(len(found),2)
        self.assertTrue(found[0].endswith("pmqc_2026_09.csv"))
        self.assertTrue(found[1].endswith("pmqc_2026_08.csv"))
        with self.assertRaises(ValueError):
            official_monthly_urls(html,limit=12)

    def test_reject_external_host(self):
        self.assertFalse(valid_month_url("https://evil.test/pmqc_2026_09.csv"))
        with self.assertRaises(ValueError):
            download_month(Session({}),"https://evil.test/pmqc_2026_09.csv")

    def test_reject_html_not_save_as_lab_result(self):
        url=BASE_URL+"2026/pmqc_2026_09.csv"
        session=Session({url:Response(b"<html>Error: API key required</html>")})
        with self.assertRaisesRegex(RuntimeError,"Falha"):
            download_month(session,url)

    def test_download_accepts_official_csv(self):
        url=BASE_URL+"2026/pmqc_2026_09.csv"
        session=Session({url:Response(HEADER)})
        self.assertEqual(download_month(session,url),HEADER)

    def test_oversized_file_blocked(self):
        url=BASE_URL+"2026/pmqc_2026_09.csv"
        session=Session({url:Response(HEADER + b"x"*(MAX_PMQC_BYTES+1))})
        with self.assertRaises(RuntimeError):
            download_month(session,url)

if __name__=="__main__":
    unittest.main()
