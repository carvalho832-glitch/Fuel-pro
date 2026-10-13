# Fuel Pro ⛽ | fase Confiança

Aplicativo de comparação de preços de combustíveis por posto em mapa Leaflet/OpenStreetMap. Desenvolvimento inicial em São José dos Campos e Araraquara, SP.

## Estado atual

- A branch \`main\` é a versão legada, não alterada por esta etapa.
- A branch \`dev/fuelpro-confianca-anp\` é uma área experimental, **não lançada ao público**.
- A visualização já apresenta origem e data da coleta, aviso de preço antigo, rota e estado explícito de ausência de dados.
- \`dados.json\` foi esvaziado **apenas na branch de desenvolvimento** porque os dois registros legados não têm identificação e preço rastreáveis. Não serão apresentados como dados atuais.
- O importador \`import_anp.py\` é experimental. Precisa ser validado com arquivos oficiais e geolocalizações verificadas antes de entrar em produção. A página oficial da ANP publica preços **coletados semanalmente, não em tempo real**.

## Origem e limites

Fonte oficial: [Levantamento semanal de preços por posto da ANP](https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/levantamento-de-precos-de-combustiveis-ultimas-semanas-pesquisadas).

O programa **não calcula etanol, aditivada ou diesel a partir da gasolina**. Só publica combustíveis, valores e datas existentes na fonte. A melhor oferta é **a menor da amostra exibida**, não necessariamente a menor da cidade.

Mesmo um preço coletado pode mudar antes da próxima pesquisa. Também não se deve inferir qualidade do combustível a partir do preço ou do cadastro do posto.

## Importação de demonstração (operador)

Instalar dependências no ambiente Python de teste:

\`\`\`bash
pip install requests beautifulsoup4 openpyxl
python -m unittest discover -s tests -v
node --check app.js
\`\`\`

Preparar as localizações pela cache \`geocache.json\` (chave = CNPJ sem pontuação; valor = \`{"lat": -23.0, "lng": -45.0}\`). Confirmar manualmente a associação CNPJ/endereço/localização. A geocodificação automática é **aproximada**, opcional, usa o Nominatim com pausa e no máximo 15 consultas novas por execução, guardando os resultados em cache. Não usá-la para coleta massiva nem tratar suas coordenadas como certificadas pela ANP.

\`\`\`bash
python import_anp.py --arquivo pesquisa_anp.xlsx --cache geocache.json --output dados.json
# Ou, após validação da estrutura do arquivo semanal da ANP:
python import_anp.py --mais-recente --geocode --max-geocode 10
\`\`\`

Se o conteúdo da ANP mudar, faltar data, ou não houver postos georreferenciados, a operação **falha e não sobrescreve o arquivo atual**. Recomenda-se executar primeiro com saída alternativa (\`--output previsualizacao.json\`), conferir endereços e datas e só depois promover para produção.

## Próximas etapas

1. Validar importação com planilha real mais recente e associar CNPJ aos cadastros oficiais dos postos, priorizando as coordenadas oficiais, quando disponíveis.
2. Adicionar histórico por CNPJ + combustível + momento da coleta, com deduplicação e auditoria.
3. Implementar verificação de preços enviados pelos motoristas (GPS + antifraude + moderação) e pelos postos parceiros.
4. Construir ranking transparente em eixos separados: qualidade (evidência), avaliação do usuário e confiabilidade do preço.
5. Testar em campo com abastecimentos reais antes de liberar ampla cobertura.

**Regra principal:** sem fonte/data e localização confiáveis, sem pin de preço. Nunca escrever "atualizado agora" para uma coleta antiga.
