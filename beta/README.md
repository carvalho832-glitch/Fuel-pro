# Fuel Pro 2.0 Beta (homologação)

**Beta 5, confirmação e correção de endereços por usuários (13/10/2026):**
https://arcane-flow-68xzkke.shipstatic.com

A ficha do posto agora permite confirmar endereço, sugerir correção
(com rua/número e observação), apagar a sugestão local, compartilhar
o relato ou abrir um issue público do GitHub para revisão. A rota pelo
endereço textual abre o Google Maps de consumidor, sem API paga.

A confirmação pertence ao usuário que a fez, fica inicialmente somente
no navegador daquele endereço de teste e não modifica a base ANP.
Quem desejar comunicar ao projeto deve compartilhar o texto ou
**concluir o envio no GitHub** (exige conta). Nenhum GPS é aprovado
automaticamente e a nota de qualidade não muda.

Ver regras e limites: `docs/BETA5_ENDERECOS_COMUNIDADE.md`.


**Beta 4, comparação de coordenadas ANP x PMQC (13/10/2026):**
https://strong-engine-h4px8y5.shipstatic.com

O motor compara a localização cadastral da ANP com os pontos informados
nas amostras do PMQC, cruzando apenas o mesmo CNPJ. Na primeira base
real: **7 postos com amostras, 6 com coordenadas comparáveis**,
**0 diferenças acima de 150 m** e **1 sem coordenada PMQC utilizável**.
As 6 correspondências são somente entre duas bases da ANP, não
verificação independente nem vistoria. **Nenhum pin foi aprovado.**

As fichas da Beta exibem o status dessa comparação quando presente.
Os outros postos continuam sem evidência PMQC geográfica associada.

**Beta 3, busca local e data das coordenadas (13/10/2026):**
https://nano-mirage-jub3t6m.shipstatic.com

**Beta 2 atualizada em 13/10/2026:**
https://drifting-echo-63b85wz.shipstatic.com

**Beta 1 anterior (preservada):**
https://vector-rune-qf3r66n.shipstatic.com

**Atenção:** este é um link de testes separado do PWA demonstrativo
(`fuelpro-teste.shipstatic.com`); não houve publicação na branch
`main` nem substituição da demonstração antiga.

## Dados exibidos

Fonte: API cadastral e levantamentos semanais da ANP, cruzados pelo
CNPJ, e análise amostral PMQC de setembro de 2026.

| Cidade | Cadastrados | Com coordenadas | Preços candidatos |
| --- | ---: | ---: | ---: |
| São José dos Campos | 131 | 127 | 0 |
| Araraquara | 63 | 51 | 13 |
| Total | 194 | 178 | 13 |

Foram associadas **14 amostras de laboratório** do PMQC a
**7 CNPJs de São José dos Campos** (CSV oficial 2026-09).
Amostras antigas **não** representam a situação atual do posto;
nem ausência de amostras representa conformidade.

O arquivo `beta/dados.json` é um *snapshot estático* gerado das
fontes ANP. Na branch de desenvolvimento, o gerador
`build_beta_snapshot.py` agora é executado pelo workflow de staging
junto com o motor e atualiza automaticamente o snapshot versionado
**a cada execução do workflow de testes**. A implantação no ShipStatic
**continua manual e separada**, para permitir revisão antes de publicar.
O workflow ainda **não possui cron semanal de produção**.

A interface mostra a data do snapshot e alerta quando a base está
antiga. O frontend oculta preços observados há mais de 30 dias,
sem apagar o histórico original no GitHub.

Os **178 pins têm coordenadas ainda não verificadas em campo**.
Estão visíveis **apenas para homologação**, com aviso permanente;
rotas não são oferecidas nesta versão. Os **16 postos sem coordenadas**
permanecem no cadastro JSON, mas não recebem pin.

## Como testar

1. Abrir no navegador do celular.
2. Selecionar *São José dos Campos*: visualizar os postos ANP sem preço
   informado, tocar num marcador e examinar as informações do PMQC quando
   existentes.
3. Selecionar *Araraquara*: os 13 postos com coleta recente da ANP
   aparecem como pins com valor e data. Os demais mostram pontos sem preço.
4. Alterar combustível e clicar em *Com preço pesquisado*.
5. Tocar num marcador e conferir data, origem, aviso geográfico e
   ausência de classificação automática de qualidade.

## Integridade e custos

- Mapa: Leaflet + OpenStreetMap; sem Google Maps Platform, sem Google
  Places e sem cobrança por API comercial.
- Nenhum valor estimado é transformado em preço atual.
- A posição provém do cadastro da ANP, mas não está confirmada em campo.
- Rotas ficam bloqueadas até verificação.
- Nada da Beta altera o PWA anterior nem os jobs da branch principal.
- Sem serviços adicionais pagos contratados.
- Não confundir relatório PMQC com inspeção em tempo real,
  autorização de funcionamento ou parecer jurídico.
- Homologação indexação: `robots.txt` e `noindex`; isso **não**
  constitui controle de acesso. Qualquer pessoa com o link pode abri-la.

## Atualizações futuras

Regerar `beta/dados.json` apenas depois de uma execução validada
de `engine_anp.py`. Rodar `python -m unittest discover -s tests -v`
e `node --check beta/app.js`. Fazer nova implantação estática
separada; não alterar o domínio do aplicativo demonstrativo.


## Nova rotina de homologação

1. Executar o motor ANP em staging (somente a branch experimental).
2. O workflow agora chama `build_beta_snapshot.py` para derivar
   `beta/dados.json` das fontes oficiais de cadastro, preço e PMQC.
3. Validar contagem, CNPJ, data da coleta, procedência, coordenadas
   ainda não validadas e notas de qualidade ausentes.
4. A versão nova do JSON fica salva na branch experimental.
5. Publicar manualmente os arquivos de `beta/` no ShipStatic após revisão.
   O link de cada implantação pode mudar. O plano gratuito disponível
   atualmente só aceita o domínio personalizado `fuelpro-teste.shipstatic.com`,
   usado pela demonstração antiga. Não substituímos essa demonstração e
   não solicitamos mudança de plano.

Os testes agora conferem **contagens dinâmicas**. Não esperam
eternamente 194 postos, pois a ANP pode cadastrar mais ou retirar alguns.

## Beta 3: localizar postos sem APIs pagas

A nova interface em `beta/station_search.js` permite pesquisar **localmente**
nome comercial, razão social, bairro, endereço, bandeira e CNPJ. Nenhum texto
de busca é enviado para a Google Maps Platform, Nominatim ou geocodificadores;
as pesquisas rodam sobre o JSON da ANP já baixado.

- Na tela principal, tocar em **Localizar posto pelo nome, bairro ou CNPJ**.
- Digitar pelo menos dois caracteres. A lista procura em **ambas as cidades**
  mesmo quando o mapa está centralizado apenas em uma delas.
- O resultado informa o CNPJ, o bairro, a existência de preço pesquisado
  e se há coordenadas ANP. São exibidos inicialmente até doze itens.
- Tocar no resultado: quando há coordenadas, a Beta aproxima o mapa e abre
  a ficha; sem coordenadas, abre apenas a ficha cadastral, **sem inventar pin**.
- Cada ficha agora apresenta CNPJ, data de obtenção da coordenada
  quando disponível e alertas de coordenadas antigas ou outros CNPJs próximos.
- A ação de criar rotas permanece **bloqueada** porque nenhuma coordenada
  cadastral foi validada em campo.

A versão `beta/sw.js` inclui o módulo de busca no cache local. Os testes de
`tests/station_search.test.cjs` usam Node sem bibliotecas comerciais e são
executados pelo GitHub Actions. As fontes de preços e laboratório não foram
modificadas nesta etapa; permanecem exclusivamente ANP.

A Beta 3 é somente homologação. O link de implantação gratuita será anotado
no histórico do projeto, sem substituir as Beta 1/2 ou o PWA anterior.
