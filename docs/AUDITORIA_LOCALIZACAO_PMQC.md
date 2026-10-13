# Fuel Pro | Auditoria de localizações e laboratório ANP

## Auditoria geográfica

O módulo `geo_audit.py` verifica todos os postos obtidos pela API oficial
de revendedores ANP:

- Coordenadas ausentes ou fora da região delimitada.
- Posição não validada expressamente pela ANP.
- Data de obtenção da posição desconhecida ou superior a 730 dias.
- Dois CNPJs separados por até 20 m (possível vizinhança legítima;
  **não** é diagnóstico automático de fraude).
- Nome ou endereço incompleto.

**Atenção:** coordenadas corretas do cadastro não garantem uma entrada
veicular segura nem a localização exata da bomba.

Arquivos exclusivos da branch de testes:
- `data/catalogo_postos_anp.json`: cadastro completo com o campo `geoAudit`.
- `data/geo_revisao_pendente.json`: fila de conferência por prioridade.
- `data/engine_status.json`: totais e motivos das pendências.

A prioridade `high` identifica postos com preços recentes observados ou
posições muito próximas de outro CNPJ, para o operador revisar primeiro;
**não** mede reputação ou qualidade. Nenhuma posição é aprovada no local
automaticamente.

### Resultado inicial

Na primeira auditoria da base de 194 postos (63 Araraquara e 131 SJC):
178 possuíam coordenadas dentro das áreas-piloto; 16 estavam sem posição
utilizável; os 178 foram classificados pela ANP como **não validados**;
145 tinham coordenadas obtidas há mais de 730 dias, e 9 CNPJs estavam
muito próximos de pelo menos outro CNPJ. Os números se sobrepõem.

## Evidências laboratoriais PMQC

A ANP publica dados mensais do PMQC por ensaio, incluindo
`DataColeta`, `IdNumeric`, `Produto`, `CnpjPosto`, `Município`,
`Uf`, `Ensaio` e `Conforme`.

Fonte oficial: https://www.gov.br/anp/pt-br/centrais-de-conteudo/dados-abertos/pmqc-programa-de-monitoramento-da-qualidade-dos-combustiveis

`pmqc_quality.py` aceita um CSV oficial fornecido ao importador,
filtra os registros pelos CNPJs e municípios de nosso cadastro e agrupa
ensaios da **mesma amostra**, para não contar vários ensaios como
inspeções independentes.

- `nonconformity_reported`: pelo menos um ensaio daquele grupo
  de amostra foi marcado como `Não`.
- `all_reported_assays_conforming`: todos os ensaios reconhecidos
  daquela amostra estavam marcados `Sim`.
- Nenhuma amostra não encontrada significa **sem evidência nesta importação**,
  não aprovação tácita do posto.
- A categoria é temporal e amostral; não é certificação, condenação,
  condição regulatória atual, nota ou estrela. Consultar documentação
  da ANP antes de atribuir conclusões jurídicas.

O pipeline principal possui opção de laboratório CSV **manual**:

```bash
python engine_anp.py --history-weeks 6 \
  --pmqc-file /caminho/para/pmqc_2026_09.csv \
  --prev data/historico_anp.json --out-dir staging
```

Quando a opção é omitida, não busca PMQC nem inventa ensaios.
Quando usada, o relatório distingue registros laboratoriais de preços,
e não publica qualquer nota. O arquivo pode ser grande; há limite
de 32 MB e cabeçalho rígido.

**Próxima etapa:** analisar cobertura PMQC real em Araraquara e SJC,
verificar amostras por CNPJ e conferir as posições prioritárias
antes de liberar dados aos motoristas.

## Segurança e custos

Sem API paga, cartão ou atualização do PWA. Os dados continuam em staging
até revisão. A parte do Google Maps não é necessária para essa etapa.
