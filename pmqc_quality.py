"""Importador conservador de evidências laboratoriais do PMQC/ANP.

Dados por ensaio e por amostra; NÃO são uma certificação permanente do
estabelecimento. A classificação de amostras não gera nota nem estrelas.
"""
from __future__ import annotations

import csv
from datetime import date, datetime, timezone
import io
import re
from urllib.parse import urlparse

from import_anp import norm

OFFICIAL_PMQC_URL = (
    "https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/"
    "pmqc-programa-de-monitoramento-da-qualidade-dos-combustiveis"
)
MAX_PMQC_BYTES = 32_000_000
NEEDED_COLUMNS = (
    "DATACOLETA", "IDNUMERIC", "PRODUTO", "CNPJPOSTO",
    "MUNICIPIO", "UF", "ENSAIO", "CONFORME",
)

def normalize_columns(row):
    return {
        re.sub(r"[^A-Z0-9]", "", norm(k)): str(v or "").strip()
        for k, v in row.items() if k
    }

def normalize_cnpj(value):
    return re.sub(r"\D", "", str(value or ""))

def parse_pmqc_csv(binary, registry, now=None, source_url=OFFICIAL_PMQC_URL):
    """Parse verified CSV. Join only identical CNPJ+UF+municipality.

    Returns a dict of evidence by CNPJ. Does not publish star ratings.
    Official results are grouped by collection/sample/product so tests for
    one sample cannot be mistaken for separate fuel inspections.
    """
    now = now or datetime.now(timezone.utc)
    if not isinstance(binary, bytes) or len(binary) > MAX_PMQC_BYTES or not binary:
        raise ValueError("CSV PMQC ausente ou fora do tamanho permitido")
    origin = urlparse(source_url)
    official_dir = "/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/pmqc/"
    raw_month = (origin.scheme == "https" and origin.netloc == "www.gov.br"
                 and origin.path.startswith(official_dir)
                 and re.search(r"/pmqc_20\d{2}_(?:0[1-9]|1[0-2])\.csv$", origin.path, re.I))
    if source_url != OFFICIAL_PMQC_URL and not raw_month:
        raise ValueError("Fonte PMQC deve ser oficial e identificada")
    try:
        text = binary.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = binary.decode("cp1252")
    reader = csv.DictReader(io.StringIO(text), delimiter=";")
    if not reader.fieldnames:
        raise ValueError("CSV PMQC sem cabeçalho")
    headers = {re.sub(r"[^A-Z0-9]", "", norm(k)) for k in reader.fieldnames if k}
    if not set(NEEDED_COLUMNS).issubset(headers):
        raise ValueError("Cabeçalhos laboratoriais incompatíveis com PMQC")
    samples = {}
    for raw in reader:
        row = normalize_columns(raw)
        cnpj = normalize_cnpj(row.get("CNPJPOSTO"))
        reg = registry.get(cnpj)
        if not reg or len(cnpj) != 14:
            continue
        if norm(row.get("UF")) != "SP" or norm(row.get("MUNICIPIO")) != reg.get("city"):
            continue
        try:
            observed = date.fromisoformat(row.get("DATACOLETA", "")[:10])
        except ValueError:
            continue
        if observed > now.date() or observed.year < 2016:
            continue
        sample_id = row.get("IDNUMERIC", "").strip()
        product = row.get("PRODUTO", "").strip()
        test = row.get("ENSAIO", "").strip()
        conforming = norm(row.get("CONFORME"))
        if not sample_id or not product or not test or conforming not in ("SIM", "NAO"):
            continue
        key = (cnpj, observed.isoformat(), sample_id, norm(product))
        record = samples.setdefault(key, {
            "cnpj": cnpj, "collectedAt": observed.isoformat(),
            "sampleId": sample_id, "product": product,
            "assays": {},
        })
        assay_key = norm(test)
        statuses = record["assays"].setdefault(assay_key, set())
        statuses.add(conforming)

    evidence = {}
    for (cnpj, collected_at, sample_id, product), record in sorted(samples.items()):
        assays = record["assays"]
        # Uma ou mais não conformidades por ensaio prevalecem dentro da amostra.
        nonconforming = any("NAO" in values for values in assays.values())
        status = "nonconformity_reported" if nonconforming else "all_reported_assays_conforming"
        station = evidence.setdefault(cnpj, {
            "status": "laboratory_samples_found",
            "source": "ANP - PMQC",
            "sourceUrl": source_url,
            "rating": None, "certifiesCurrentQuality": False,
            "sampleCount": 0, "samplesWithNonconformity": 0,
            "samplesWithAllReportedAssaysConforming": 0,
            "latestSampleAt": None, "samples": [],
            "disclaimer": "Resultados de ensaios em amostras coletadas, não garantia da qualidade atual do posto."
        })
        station["sampleCount"] += 1
        field = ("samplesWithNonconformity" if nonconforming
                 else "samplesWithAllReportedAssaysConforming")
        station[field] += 1
        station["latestSampleAt"] = max(collected_at, station["latestSampleAt"] or collected_at)
        station["samples"].append({
            "sampleId": sample_id, "product": product,
            "collectedAt": collected_at, "reportedAssayCount": len(assays),
            "status": status,
        })
    return evidence
