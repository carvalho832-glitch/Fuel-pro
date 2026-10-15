# Fuel Pro | Histórico, divergências e publicação comunitária

## Três camadas separadas

1. `fuelpro_reports`: relato particular de motorista, sem cadastro obrigatório.
2. `fuelpro_review_logs`: decisão administrativa imutável, já em operação.
3. `fuelpro_public_stations`: aviso comunitário **opcional**, criado somente
   após uma SEGUNDA confirmação explícita do administrador.

A fonte da publicação, em `fuelpro_publication_sources`, é privada e
não expõe UID anônimo no aviso público.

## Histórico de decisões

O painel passa a consultar até 80 entradas recentes de auditoria, exibindo
situação, posto, data e justificativa. A caixa principal carrega até 150 relatos.
Essas quantidades são limites de carregamento, não contagem global garantida.

## Divergências

O painel compara os endereços informados por usuários para o mesmo CNPJ.
Relatos pendentes ou aprovados diferentes produzem alerta. Relatos rejeitados
não contam como evidência conflitante vigente. Normalização elimina acentos,
pontuação e variações básicas na grafia. Isso **não substitui** verificação
de correspondência física e não decide automaticamente qual endereço prevalece.

## Publicação controlada, versão inicial

O botão **Publicar confirmação revisada** só estará disponível quando:
- O relato já estiver aprovado no Firestore;
- O tipo for confirmação, não correção;
- O endereço informado corresponder ao endereço ANP;
- Não houver outro relato vigente com endereço diferente, dentro dos
  registros carregados no painel;
- Não existir publicação anterior para o mesmo CNPJ.

O backend exige aprovação anterior, operação atômica com referência privada,
login Google autorizado e dados públicos mínimos. Os dois documentos são
criados juntos; sua edição/exclusão pública é bloqueada nesta fase.

**Limite importante:** um relato aprovado significa que um administrador
revisou o envio. NÃO comprova por si só visita de campo, funcionamento,
qualidade do combustível, localização GPS exata nem endosso da ANP.

Na Beta, a ficha do posto consulta `fuelpro_public_stations/{cnpj}` somente
quando aberta. Caso exista publicação, mostra um aviso sobre a confirmação
comunitária revisada. O cadastro oficial, os preços e a localização não são
sobrescritos.

## Próxima fase

Publicação de correções de endereços dependerá de critérios adicionais
e processo de revisão/revogação de uma publicação existente. A versão
inicial **não publica correções**, evita sobrescritas e não faz reversão
de avisos comunitários via navegador.

## Implantação e testes

- Site administrativo: https://fuelpro-admin-832.web.app
- Site de motoristas: https://fuelpro-app-832.web.app
- Regras compartilhadas do Firestore: `firebase/firestore.rules`.
- Testes: `tests/community_publication.test.cjs`, junto aos testes do
  Fuel Pro Admin, do envio anônimo e da base ANP.
- Manter o plano Spark sem faturamento e respeitar cotas de leitura/escrita.
- Nenhuma confirmação será publicada automaticamente por esta implementação.
