"""Arquivo semanal da ANP: recuperação controlada de semanas anteriores.

Usa somente links oficiais de planilhas *por posto* já publicados na
página de levantamentos semanais; não acessa mapas comerciais.
"""
from __future__ import annotations

from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
from import_anp import ANP_WEEKLY_PAGE, norm, parse_rows, xlsx_rows, csv_rows

ALLOWED_HOSTS = {"www.gov.br", "www.anp.gov.br"}
MAX_WEEKLY_BYTES = 15_000_000

def recent_official_links(page_html, page_url=ANP_WEEKLY_PAGE, limit=8):
    if not isinstance(limit, int) or not 1 <= limit <= 12:
        raise ValueError("O limite de pesquisa deve estar entre 1 e 12 semanas")
    soup = BeautifulSoup(page_html, "html.parser")
    links = []
    seen = set()
    for a in soup.find_all("a", href=True):
        title = norm(a.get_text(" ", strip=True))
        if not title.startswith("PRECOS POR POSTO REVENDEDOR"):
            continue
        url = urljoin(page_url, a["href"])
        parts = urlparse(url)
        if parts.scheme != "https" or parts.netloc not in ALLOWED_HOSTS:
            continue
        if not parts.path.lower().endswith((".xlsx", ".csv")):
            continue
        if url in seen:
            continue
        links.append(url)
        seen.add(url)
        if len(links) >= limit:
            break
    if not links:
        raise RuntimeError("Nenhuma planilha oficial por posto localizada")
    return links

def fetch_history(session, weeks=8):
    page = session.get(ANP_WEEKLY_PAGE, timeout=35)
    page.raise_for_status()
    urls = recent_official_links(page.text, page.url, limit=weeks)
    observations = []
    summary = []
    for url in urls:
        resp = session.get(url, timeout=90)
        resp.raise_for_status()
        if len(resp.content) > MAX_WEEKLY_BYTES:
            raise RuntimeError("Arquivo da ANP acima do limite de segurança")
        if not resp.content.startswith(b"PK") and not urlparse(url).path.endswith(".csv"):
            raise RuntimeError("Formato inválido em arquivo ANP")
        rows = xlsx_rows(resp.content) if resp.content.startswith(b"PK") else csv_rows(resp.content)
        stations = parse_rows(rows)
        weekly = []
        for post in stations:
            for fuel, price in post["prices"].items():
                day = post["collectedAtByFuel"].get(fuel)
                if day:
                    weekly.append({
                        "cnpj": post["cnpj"], "fuel": fuel,
                        "price": price, "collectedAt": day,
                        "source": "ANP - levantamento semanal"
                    })
        observations.extend(weekly)
        summary.append({"url": url, "stations": len(stations), "observations": len(weekly)})
        print("ANP semana processada:", url.rsplit("/",1)[-1], len(stations), "postos nas cidades piloto")
    return observations, summary
