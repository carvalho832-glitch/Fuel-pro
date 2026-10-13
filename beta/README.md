# Fuel Pro 2.0 Beta (homologação)

**Endereço da Beta publicada em 13/10/2026:**
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
fontes ANP em 13/10/2026. A Beta **não** recebe atualizações
automáticas enquanto não houver controle de integridade da publicação.
Ao mudar a data, o frontend oculta valores observados há mais de 30 dias,
sem apagar o histórico original do repositório.

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
