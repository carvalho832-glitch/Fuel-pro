# Fuel Pro | Compromisso de custo zero (MVP)

**Decisão:** desenvolver, testar e publicar a primeira versão sem contratar serviços pagos, sem Google Maps Platform/Places pagos e sem cadastrar meios de pagamento especificamente para o Fuel Pro.

## Infraestrutura e responsabilidades

| Parte | Opção inicial | Limites e cuidados |
| --- | --- | --- |
| Mapa | Leaflet + dados OpenStreetMap | Dados OSM são abertos. O servidor público de tiles não oferece uso ilimitado nem SLA; cumprir política, atribuição visível, cache e nada de pré-download de mapas. Trocar de provedor se o tráfego crescer. |
| Cadastros e geolocalização dos postos | API oficial de revendedores ANP, cruzamento por CNPJ | Coordenadas ausentes ou não validadas não podem ser apresentadas como certificadas. Cache local dos cadastros. |
| Preços | Planilha oficial de pesquisa por posto ANP | Levantamento semanal e amostral, sem afirmar que seja preço atual. Não inventar valores de outros combustíveis. |
| Armazenamento temporário | Arquivos JSON versionados em branch de testes do GitHub | Histórico crescente: planejar migração ao atingir limites do repositório. Dados de usuários não devem ser armazenados em repositório público. |
| Automação | GitHub Actions em repositório público | Execução padrão gratuita para repositórios públicos, sujeita a políticas, limites e possíveis mudanças; revisar jobs e faturamento antes de escalar. |
| Hospedagem estática | GitHub Pages em repositório público ou ShipStatic no plano gratuito existente | Observar regras de uso/limites. Nenhum produto pago será habilitado automaticamente. |
| Pesquisa de bairro/cidade | Serviço compatível com orçamento zero, de uso moderado e cache | Nominatim público: no máximo 1 solicitação/segundo para toda aplicação, sem autocomplete nem varredura sistemática. Planejar substituição quando houver tráfego alto. |
| Atualização comunitária (fase futura) | Proposta para moderação, autenticidade e prevenção de fraude | Somente iniciar quando houver backend compatível com custo zero e tratamento de dados pessoais; nunca editar preços globais apenas no navegador. |

## Proteções de custo

1. Sem Google Maps JavaScript, Google Places, rotas comerciais, Mapbox ou serviços de faturamento por chamada na versão inicial.
2. Não ativar cartão, créditos automáticos, upgrade, faturamento pago ou assinaturas para o projeto sem aprovação explícita.
3. Antes de usar qualquer serviço novo: verificar cota gratuita, gatilho de cobrança, possibilidade de desligar e custo máximo.
4. Não realizar busca massiva de coordenadas no Nominatim nem fazer download de tiles para uso offline no provedor público.
5. Manter chave de configuração de mapas isolada para mudar o provedor; sempre preservar atribuição de licença.
6. Publicação de preços reais exige fonte, data e correspondência por CNPJ. Cadastro na ANP não significa garantia de qualidade.
7. Exibir indicadores separados de preço, frescor, avaliação de usuários e histórico regulatório, com a evidência atribuída.

## Limitações

**Meta de gasto para o MVP: R$ 0, não garantia de operação ilimitada sem custos.** Serviços gratuitos têm cotas, políticas e restrições. Se surgirem usuários suficientes para exigir infraestrutura maior, interromper expansão técnica e apresentar orçamento e alternativas antes de contratar.

## Fontes oficiais

- Preços semanais ANP: https://www.gov.br/anp/pt-br/assuntos/precos-e-defesa-da-concorrencia/precos/levantamento-de-precos-de-combustiveis-ultimas-semanas-pesquisadas
- Política de tiles OSM: https://operations.osmfoundation.org/policies/tiles/
- Política Nominatim: https://operations.osmfoundation.org/policies/nominatim/
- Pages (repositórios públicos): https://docs.github.com/en/pages/quickstart
- Actions (repositórios públicos): https://docs.github.com/en/actions/concepts/billing-and-usage

**Status atual:** desenvolvimento separado da versão pública, com 5 postos de Araraquara candidatos a revisão e 30 observações ANP armazenadas. Nenhum preço deve ser anunciado em tempo real sem confirmação específica.
