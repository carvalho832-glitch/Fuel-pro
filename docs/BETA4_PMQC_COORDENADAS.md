# Beta 4 | Comparação de coordenadas ANP x PMQC

## Por que esta etapa existe

Uma posição pode estar dentro da cidade correta e ainda marcar a rua
errada. O Fuel Pro agora compara a latitude/longitude do
**cadastro de revendedores da ANP** com a latitude/longitude declarada
em cada amostra do **PMQC da ANP**, sempre pelo mesmo CNPJ e município.

Os dois arquivos são oficiais, mas ambos pertencem à ANP e **podem usar
a mesma informação cadastral**. Portanto, concordância significa apenas
"as fontes ANP estão próximas", e não validação independente, em campo
ou da entrada para automóveis.

## Regras de comparação

- `pmqc_quality.py`: conserva posições geográficas válidas por amostra
  (CNPJ, identificador, combustível e data), sem contar cada ensaio como
  uma nova visita. Ignora coordenadas ausentes ou fora do município.
- Na mesma amostra, variações pequenas de coordenadas não são
  classificadas como conflito. Uma divergência superior a **150 metros**
  recebe aviso.
- `pmqc_geo_crosscheck.py`: compara as posições disponíveis da
  amostragem mais recente com o cadastro de revendas ANP.
- Até 150 m: `anp_sources_nearby_unverified` (fontes ANP próximas,
  **não certificadas**).
- Acima de 150 m: `anp_sources_diverge` (posição divergente, análise
  humana prioritária).
- Ausência em uma fonte: `pmqc_without_coordinates` ou
  `registry_without_coordinates`, sem preencher com coordenadas supostas.
- A auditoria preserva `manualReviewApproved = false`, mesmo quando
  as duas fontes coincidem precisamente.
- Nenhuma diferença geográfica aumenta ou reduz a nota de qualidade
  do combustível, que continua sem classificação automática.

## Arquivos da branch de testes

- `data/pmqc_geo_crosscheck.json`: comparação por CNPJ.
- `data/engine_status.json`: número de postos comparáveis,
  divergências, dados faltantes e amostras com coordenadas conflitantes.
- `data/catalogo_postos_anp.json`: inclui a comparação no campo
  `geoAudit.pmqcCrosscheck`.
- `data/geo_revisao_pendente.json`: divergências relevantes entram
  na prioridade alta.
- `beta/dados.json`: expõe somente o resumo relevante para a ficha,
  sem certificar a localização.

O sistema usa arquivos públicos já previstos na rotina ANP/PMQC,
sem contratar Google Maps Platform ou APIs pagas. Esta etapa não realiza
geocodificação automática nem certificação in loco.

## Critérios para encerrar a revisão de um posto

Será necessária uma verificação humana baseada em evidências independentes:
por exemplo, localização e endereço oficiais atuais do estabelecimento,
fotografia georreferenciada consentida ou vistoria local registrada.
A comparação ANP x PMQC, sozinha, **não basta**.

A Beta continua com pins provisórios e sem rotas ativadas.
