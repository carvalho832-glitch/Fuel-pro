# Fuel Pro ⛽ | fase Confiança

Aplicativo de comparação de preços de combustíveis por posto em mapa Leaflet/OpenStreetMap. Desenvolvimento inicial em São José dos Campos e Araraquara, SP.

## Estado atual

- A branch `main` é a versão legada, não alterada por esta etapa.
- A branch `dev/fuelpro-confianca-anp` é uma área experimental, **não lançada ao público**.
- A visualização já apresenta origem e data da coleta, aviso de preço antigo, rota e estado explícito de ausência de dados.
- `dados.json` foi esvaziado **apenas na branch de desenvolvimento** porque os dois registros legados não têm identificação e preço rastreáveis. Não serão apresentados como dados atuais.
- O importador `import_anp.py` é experimental. A leitura do arquivo oficial da semana de 04 a 10/10/2026 passou no teste automatizado e identificou 8 postos nas duas cidades piloto. Ainda faltam geolocalização validada e revisão dos registros antes de entrar em produção. A página oficial da ANP publica preços **coletados semanalmente, não em tempo real**.

## Origem e limites

Fonte oficial: [Levantamento semanal de preços por posto da ANP](https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/levantamento-de-precos-de-combustiveis-ultimas-semanas-pesquisadas).

O programa **não calcula etanol, aditivada ou diesel a partir da gasolina**. Só publica combustíveis, valores e datas existentes na fonte. A melhor oferta é **a menor da amostra exibida**, não necessariamente a menor da cidade.

Mesmo um preço coletado pode mudar antes da próxima pesquisa. Também não se deve inferir qualidade do combustível a partir do preço ou do cadastro do posto.

## Importação de demonstração (operador)

Instalar dependências no ambiente Python de teste:

```bash
pip install requests beautifulsoup4 openpyxl
python -m unittest discover -s tests -v
node --check app.js
```

Preparar as localizações pela cache `geocache.json` (chave = CNPJ sem pontuação; valor = `{"lat": -23.0, "lng": -45.0}`). Confirmar manualmente a associação CNPJ/endereço/localização. A geocodificação automática é **aproximada**, opcional, usa o Nominatim com pausa e no máximo 15 consultas novas por execução, guardando os resultados em cache. Não usá-la para coleta massiva nem tratar suas coordenadas como certificadas pela ANP.

```bash
python import_anp.py --arquivo pesquisa_anp.xlsx --cache geocache.json --output dados.json
# Ou, após validação da estrutura do arquivo semanal da ANP:
python import_anp.py --mais-recente --geocode --max-geocode 10
```

Se o conteúdo da ANP mudar, faltar data, ou não houver postos georreferenciados, a operação **falha e não sobrescreve o arquivo atual**. Recomenda-se executar primeiro com saída alternativa (`--output previsualizacao.json`), conferir endereços e datas e só depois promover para produção.

## Próximas etapas

1. Validar importação com planilha real mais recente e associar CNPJ aos cadastros oficiais dos postos, priorizando as coordenadas oficiais, quando disponíveis.
2. Adicionar histórico por CNPJ + combustível + momento da coleta, com deduplicação e auditoria.
3. Implementar verificação de preços enviados pelos motoristas (GPS + antifraude + moderação) e pelos postos parceiros.
4. Construir ranking transparente em eixos separados: qualidade (evidência), avaliação do usuário e confiabilidade do preço.
5. Testar em campo com abastecimentos reais antes de liberar ampla cobertura.

**Regra principal:** sem fonte/data e localização confiáveis, sem pin de preço. Nunca escrever "atualizado agora" para uma coleta antiga.


## Motor de dados ANP (nova etapa)

A integração de dados reais foi implementada em `engine_anp.py` e verificada
contra as duas fontes oficiais:

1. **ANP preços por posto (XLSX semanal):** extrai CNPJ, combustível, preço real e data da coleta.
2. **API ANP Revendedores:** para Araraquara e São José dos Campos, retorna os cadastros e coordenadas quando disponíveis.
3. **Junção pelo CNPJ:** nunca associa um preço a um posto apenas por proximidade ou nome; quando não há CNPJ ou localização, deixa o registro fora dos pins.
4. **Histórico imutável por CNPJ/combustível/data:** evita duplicação da mesma pesquisa, mas guarda os preços das semanas seguintes.
5. **Controle de validade:** preços com mais de 30 dias são excluídos dos pins; ficam preservados no histórico para auditoria.
6. **Geolocalização sob ressalva:** posições não validadas pela ANP são identificadas como aproximadas. Isso **não comprova** qualidade ou conformidade do posto.

### Primeira integração real

Em 12/10/2026, a pesquisa semanal de 04 a 10/10 e o cadastro ANP retornaram,
nas duas cidades piloto, **194 postos cadastrados** (63 em Araraquara e 131 em São José dos Campos).
A planilha semanal continha preços de **8 postos, todos de Araraquara**; nenhum
posto de São José dos Campos aparecia nessa pesquisa. Desses 8, **5 puderam
ser associados a coordenadas da API ANP**, ainda sem validação geográfica
certificada. A amostra gerou 30 observações de preço. Os outros 3 permaneceram
sem pin por ausência de correspondência cadastral ou coordenadas. A quantidade poderá
variar entre pesquisas.

### Onde ficam os dados

- `data/historico_anp.json`: observações rastreáveis por CNPJ, combustível e data.
- `data/postos_anp_candidatos.json`: resultados de preços com coordenadas disponíveis para revisão.
- `data/engine_status.json`: cobertura, motivos de exclusão e horário de geração.

Esses arquivos são escritos **apenas na branch de desenvolvimento**, pelo
workflow `.github/workflows/store_staging.yml`. O `dados.json` e o
site PWA público NÃO são atualizados automaticamente pelo motor nesta fase.
A versão visual de demonstração mantém preços fictícios claramente rotulados.

Teste local (precisa de acesso à internet):

```bash
python -m pip install requests beautifulsoup4 openpyxl
python -m unittest discover -s tests -v
python engine_anp.py --prev data/historico_anp.json --out-dir staging
```

Próximo marco: validar a posição dos cinco postos em mapa com fonte cadastral e
iniciar a publicação gradual de preços reais, com indicação clara de data e
de posição não validada. O ranking de qualidade ficará independente do preço.


## Evolução do histórico multi-semanal (13/10/2026)

O motor passou a coletar até **6 arquivos semanais oficiais** por posto, combinar
os preços pelo CNPJ e escolher, para cada combustível, a coleta mais recente
dentro do limite de **30 dias**. A data original da coleta nunca é substituída
pela data de processamento. Arquivos históricos são recuperados da página da
ANP, com um índice de URLs oficiais de contingência em
`data/anp_week_urls.json` para quedas momentâneas de acesso.

**Resultado real da primeira execução integrada, armazenado na branch de testes:**
- 202 observações históricas, em 6 pesquisas semanais.
- 13 postos com preços nos últimos 30 dias e geocoordenadas da ANP, todos em Araraquara.
- 0 postos de São José dos Campos com preço na janela pesquisada.
- Os 13 pontos continuam classificados com geolocalização **não validada**.
- Nenhum preço real foi enviado automaticamente ao PWA público.

O workflow `.github/workflows/store_staging.yml` foi validado com sucesso
para gravar o histórico na branch experimental. Ele **não é um agendamento
semanal em produção**: para funcionar em cron do GitHub, o workflow precisará
estar na branch padrão e essa migração depende de revisão e aprovação.

Cuidado: a versão legada em `main` ainda possui o antigo workflow
`.github/workflows/update.yml`, cujo scraper está com falhas conhecidas.
Antes do lançamento novo, desabilitar/substituir o legado para evitar
informações sem procedência. Não alterá-lo sem uma mudança planejada.
