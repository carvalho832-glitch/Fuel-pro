# Fuel Pro 2.1 | GPS local, postos próximos e fichas organizadas

## Entrega

App dos motoristas: https://fuelpro-app-832.web.app

Painel administrativo, preservado e independente:
https://fuelpro-admin-832.web.app

O Fuel Pro 2.1 acrescenta busca por proximidade utilizando as coordenadas
já disponíveis no catálogo oficial ANP e GPS **sob permissão explícita**
do usuário. Não são contratadas APIs de geocodificação, Places ou Google
Maps Platform.

### Mapa e postos próximos

- Botão **Perto de mim** abre o painel de postos próximos e solicita GPS
  somente quando o usuário toca no botão e ainda não tem posição em memória.
- Botão flutuante de GPS centraliza o mapa na posição corrente quando permitido.
- O navegador chama `navigator.geolocation.getCurrentPosition` uma vez,
  com tempo máximo de espera, sem monitoramento contínuo (`watchPosition`).
- A posição fica **exclusivamente na memória JavaScript da página**;
  não é salva no Firestore, cookies, localStorage ou no nosso backend.
  Ao fechar/recarregar a página, o ponto é descartado.
- Ao centralizar o mapa, o navegador solicita tiles/cartografia da área
  ao OpenStreetMap. Portanto, o provedor de mapas recebe solicitações
  geográficas da área visualizada, mesmo que o Fuel Pro não grave o GPS.
- A localização precisa de HTTPS e autorização do navegador. Quando
  negada, expirada ou indisponível, a busca por nome/CNPJ continua funcionando.
- Filtra postos em raios de 2, 5, 10, 20 e 50 km, sem geocodificação.
- Usa haversine para **distância em linha reta**. Não promete trajetos,
  tempos de viagem, entrada correta no posto ou coordenadas verificadas.
- Seleciona automaticamente São José dos Campos ou Araraquara apenas
  quando há posto com coordenadas até 30 km da posição medida.
- Postos ANP sem coordenadas não são inventados. Continuam pesquisáveis
  pelo nome, bairro, endereço ou CNPJ.
- Lista ordenada por distância, exibe nome, endereço, coleta ANP
  (quando válida) e distância em linha reta.

### Fichas

- Nome e endereço do cadastro ANP sempre identificados.
- Destaques: bandeira cadastrada, distância aproximada quando existe GPS,
  e aviso de posição ANP ainda provisória.
- Valor e data da última coleta ANP exibidos somente quando válidos,
  sem confundir com preço em tempo real.
- Informações de qualidade PMQC e auditoria de GPS preservadas
  em seção expansível de dados técnicos para reduzir rolagem.
- Botão de rota continua usando o **endereço textual** via Google Maps
  de consumidor, sem custos de Maps API e com pedido para conferir destino.
- Confirmações comunitárias, Firebase Anonymous, Firestore e painel
  Admin seguem iguais. Nenhuma aprovação/pin é fabricada.

### Arquivos e testes

- `beta/nearby_stations.js`: funções puras (Haversine, proximidade,
  validação e ordenação por CNPJ).
- `beta/app.js`: integração com GPS, Leaflet e lista local.
- `beta/index.html`, `beta/style.css`, `beta/sw.js`: interface
  e versão nova de cache.
- `tests/nearby_stations.test.cjs`: raios, cidades, empates,
  ausência de coordenadas, permissões do navegador, privacidade e
  preservação das informações oficiais.
- CI GitHub testa módulo, versão antiga de envio Firebase,
  busca por nome, painel administrativo, dados ANP e regras estáticas.

### Custo e cuidados

Firebase permanece no Spark, com faturamento desativado.
Os dados ANP não foram regenerados manualmente nem alterados.
Os pins ANP são explicitamente provisórios. OpenStreetMap Tiles
possui política de utilização: esse recurso é adequado para testes
e uso leve, não uma licença ilimitada para alto tráfego.

Não há autenticação obrigatória do motorista nem novo banco de dados.
