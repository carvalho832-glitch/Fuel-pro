# Fuel Pro: indicadores de confiança (MVP, versão 1)

O objetivo é informar sem inventar reputação, qualidade ou preço atual.

## Três dimensões independentes

**1. Evidência do preço (por combustível).** Apenas pesquisa por posto da ANP com CNPJ, combustível e data observada. Estado temporal: até 3 dias; 4–7; 8–14; 15–30; mais de 30 dias. Esses prazos medem somente **idade da observação**, não garantem que o preço seja o atual na bomba. Uma coleta da ANP é amostral. Valores com mais de 30 dias não entram nos preços candidatos do mapa e ficam apenas no histórico.

**2. Evidência da localização.** Coordenadas obtidas da API de revendedores da ANP e associadas por CNPJ. `validated` só se a origem identificar expressamente posição geográfica validada. Caso contrário, `not_validated` ou `unavailable`. Um pin da API ainda pode estar incorreto; antes de liberar rotas definitivas, conferir posições. Posto sem coordenadas não recebe pin.

**3. Evidência de qualidade e avaliações.** A API cadastral da ANP, a bandeira e o preço **não provam qualidade do combustível**. Sem um resultado laboratorial atribuído ao mesmo CNPJ, com data e situação interpretada corretamente, o campo `quality.rating` deve permanecer `null`. Sem avaliações verificadas, `community.rating` deve permanecer `null`. Não derivar nota de qualidade de estrelas de outra plataforma ou de preço barato. O `overallScore` fica `null` até que haja evidência, metodologia pública e revisão.

## Cadastro completo vs. preços pesquisados

O motor gera **dois conjuntos separados, sem implantação pública automática**:

- `data/postos_anp_candidatos.json`: apenas postos com preços observados em até 30 dias e coordenadas no cadastro, ainda sujeitos a revisão.
- `data/catalogo_postos_anp.json`: todos os postos retornados pelas duas buscas cadastrais da ANP, inclusive os que **não possuem preço pesquisado**. `priceStatus: not_available` sempre vem com `prices: {}`; isso não significa posto barato, caro ou inativo.

O campo `fuelScore` contém os estados de evidência em cada estabelecimento. Não é um sistema de estrelas.

## Decisão editorial de exibição

No PWA futuro, mostrar `Preço não informado` nos pins de postos sem preços; **não** mostrar `R$ 0,00`, um valor médio inventado ou qualquer selo de qualidade presumida. Posição com `not_validated` precisa de aviso visível. Atualizações colaborativas ficarão bloqueadas até existir backend auditável, antifraude, consentimento e moderação.

## Política de custos e implantação

Usar apenas dados públicos ANP e processamento gratuito na fase de testes. O workflow de staging não é a publicação do PWA. A versão `main` e o PWA já distribuído permanecem preservados. Integrar ao aplicativo público somente após revisão dos endereços e decisão explícita de publicar.
