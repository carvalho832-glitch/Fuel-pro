"""Baixa somente CSV PMQC oficial da ANP, sem API comercial ou dados inventados.

Não cria nota nem atualiza o PWA. O arquivo bruto fica temporário no
GitHub Actions e nunca deve ser commitado no repositório.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import re
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from import_anp import UA
from pmqc_quality import MAX_PMQC_BYTES, OFFICIAL_PMQC_URL

INDEX_URL = OFFICIAL_PMQC_URL
FALLBACK_MONTH = "2026_09"
BASE_URL = (
    "https://www.gov.br/anp/pt-br/centrais-de-conteudo/"
    "dados-abertos/arquivos/pmqc/"
)
MONTH_FILE = re.compile(r"/pmqc_(20\d{2})_(0[1-9]|1[0-2])\.csv$", re.I)

def valid_month_url(url):
    parsed = urlparse(url)
    return (parsed.scheme == "https" and parsed.netloc == "www.gov.br"
            and parsed.path.startswith(urlparse(BASE_URL).path)
            and MONTH_FILE.search(parsed.path) is not None)

def official_monthly_urls(page_html, page_url=INDEX_URL, limit=1):
    if not isinstance(limit, int) or not 1 <= limit <= 6:
        raise ValueError("Importação limitada a seis arquivos mensais")
    soup = BeautifulSoup(page_html, "html.parser")
    links = set()
    for link in soup.find_all("a", href=True):
        url = urljoin(page_url, link["href"])
        if valid_month_url(url):
            links.add(url)
    return sorted(links, key=lambda url: MONTH_FILE.search(urlparse(url).path).groups(),
                  reverse=True)[:limit]

def download_month(session, url):
    if not valid_month_url(url):
        raise ValueError("URL PMQC não pertence aos arquivos mensais da ANP")
    # O governo pode responder com HTML, captcha ou 401. Em qualquer caso
    # falhar claramente, nunca tratar HTML como laudo real.
    candidates = [url, url + "/@@download/file"]
    errors = []
    for candidate in candidates:
        try:
            with session.get(candidate, timeout=100, stream=True) as response:
                response.raise_for_status()
                parts = []
                total = 0
                for part in response.iter_content(chunk_size=1024*256):
                    if not part:
                        continue
                    total += len(part)
                    if total > MAX_PMQC_BYTES:
                        raise ValueError("Arquivo PMQC excede tamanho permitido")
                    parts.append(part)
                data = b"".join(parts)
                start = data[:300].decode("utf-8-sig", errors="replace").lstrip().lower()
                if not start.startswith("datacoleta;"):
                    raise ValueError("Arquivo recebido não é CSV PMQC com cabeçalho esperado")
                return data
        except (requests.RequestException, ValueError) as error:
            errors.append(f"{type(error).__name__} ({str(error)[:120]})")
    raise RuntimeError(f"Falha ao buscar {url}: " + " | ".join(errors))

def download_latest(output_path, session=None):
    session = session or requests.Session()
    session.headers.update({"User-Agent": UA, "Accept": "text/csv, */*"})
    fallback = BASE_URL + "2026/pmqc_" + FALLBACK_MONTH + ".csv"
    page_mode = "latest_verified"
    try:
        r = session.get(INDEX_URL, timeout=40)
        r.raise_for_status()
        urls = official_monthly_urls(r.text, r.url, 1)
        if not urls:
            raise ValueError("Página ANP não apresenta CSV mensal")
        url = urls[0]
    except (requests.RequestException, ValueError):
        url = fallback
        page_mode = "fallback_2026_09"
    binary = download_month(session, url)
    output = Path(output_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(binary)
    print("PMQC original da ANP:", url, "| bytes:", len(binary), "| modo:", page_mode)
    return {"url": url, "bytes": len(binary), "mode": page_mode}

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--out", default="staging/pmqc_raw.csv")
    args = parser.parse_args()
    download_latest(args.out)
