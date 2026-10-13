# Fuel Pro | Integração PMQC e auditoria de 22 postos prioritários

## Objetivo

Cruzar o cadastro oficial dos postos com os resultados amostrais do PMQC,
sem criar avaliações comerciais, estrelas ou certificados de qualidade.

## Fonte laboratorial e período

Página oficial da ANP:
https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/pmqc-programa-de-monitoramento-da-qualidade-dos-combustiveis

Arquivo de referência validado na página em 13/10/2026:
https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/arquivos/pmqc/2026/pmqc_2026_09.csv

O robô em `fetch_pmqc.py` procura o CSV mais recente disponibilizado na
página, rejeita links de terceiros e verifica o cabeçalho. Se a página
ficar inacessível, só aceita a URL de contingência conhecida de setembro
de 2026; não presume que ela seja sempre o mês mais recente.
O CSV bruto não é incluído em commits.

O importador `pmqc_quality.py` confere CNPJ, município e UF, agrupa por
identificador da amostra, data e combustível, e preserva as conclusões
de cada ensaio. A presença de um ensaio não conforme é registrada na amostra,
**sem** rotular permanentemente o estabelecimento como irregular.
A ausência de uma amostra não prova conformidade; o PMQC é amostral e não
substitui a fiscalização.

No `fuelScore`, `quality.rating` e `overallScore` continuam `null`,
inclusive quando há resultados laboratoriais.

## Revisão dos 22 postos com prioridade alta

O arquivo `data/geo_revisao_pendente.json` traz coordenadas, CNPJ,
nome e motivos da priorização; o arquivo
`data/geo_cruzamento_enderecos.json` compara endereços ANP da pesquisa
semanal com endereços do cadastro da agência.

O cruzamento diferencia:
- `textually_consistent_unverified_location`: nome de rua e número
  coincidem textualmente, mas não confirma a coordenada GPS.
- `address_discrepancy_needs_review`: os dois endereços parecem divergir.
- `not_comparable`: falta endereço num dos conjuntos ou a pesquisa
  recente não incluiu o posto.

Essa conferência não significa visita, certificação geográfica ou
identificação segura da entrada de veículos. Por segurança,
`manualReviewApproved` fica `false`.

## Execução

Fluxo experimental:
`.github/workflows/store_staging.yml`.

- Faz download do PMQC oficial no runner.
- Busca preços semanais ANP e cadastro de postos.
- Importa amostras do laboratório e preserva origem e data.
- Gera relatórios de cruzamento cadastral e revisão de geolocalização.
- Grava dados derivados apenas na branch `dev/fuelpro-confianca-anp`.
- Não atualiza `dados.json` nem o PWA público.
- Não contrata API, servidor ou serviço pago.

O legado `.github/workflows/update.yml` já foi neutralizado **nesta
branch** para não reintroduzir preços sem procedência quando ocorrer
um merge revisado. Na branch principal, ele ainda depende de revisão
antes de qualquer publicação definitiva.

## Revisões ainda necessárias

1. Confirmar os CNPJs laboratoriais associados e datas das amostras reais.
2. Conferir endereço e entrada dos 22 postos de prioridade alta usando
   múltiplas evidências ou verificação presencial.
3. Definir política pública de contestação/correção e critérios de
   atualização colaborativa sem aumentar custos nem criar difamação.
4. Revisar o PR e o workflow legado antes de qualquer merge em `main`.
