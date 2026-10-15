# Fuel Pro Admin | painel independente

**Painel administrativo:** https://fuelpro-admin-832.web.app

**Aplicativo de motoristas (preservado):** https://fuelpro-app-832.web.app

São dois sites Firebase Hosting no mesmo projeto Spark 'fuelpro-app-832',
com código e implantação separados. O painel está no diretório admin/,
fora do app beta/ de motoristas.

## Funcionalidades implementadas

- Login Google, sem login obrigatório aos motoristas.
- Autorização validada no Firestore por documento fuelpro_admins/{uid}
  com campo booleano active=true.
- Caixa de entrada dos relatos fuelpro_reports (até 150 carregados).
- Filtro por pendentes, aprovados e rejeitados, busca por posto/CNPJ/cidade.
- Comparação dos endereços cadastrados na ANP e relatados pelo usuário.
- Decisão com confirmação explícita e justificativa ao rejeitar.
- Cada decisão altera o status e cria documento de auditoria em
  fuelpro_review_logs/{reportId}, ambos na mesma operação atômica.
- Nenhuma aprovação altera automaticamente preço, GPS ou cadastro ANP.
- Dados do usuário são inseridos na interface somente por textContent.

## Primeira autorização administrativa

Não há cadastro público de administradores nem chave secreta no site.

1. Abrir https://fuelpro-admin-832.web.app no Chrome.
2. Entrar com a conta Google escolhida para administrar o Fuel Pro.
3. A tela mostrará "Aguardando autorização" e o UID dessa conta.
4. Copiar o UID (identificador, não senha) e passar ao operador autorizado
   à configuração do projeto Firebase.
5. Criar manualmente em Firestore o documento fuelpro_admins/{UID},
   contendo active: true (tipo boolean), via credencial administrativa
   ou Console Firebase.
6. Voltar ao painel e clicar "Verificar acesso novamente".
7. Revogar acesso futuramente definindo active: false.

Não usar o UID anônimo do aplicativo dos motoristas; é o UID da conta
Google autenticada no painel independente.

## Segurança e testes

- Regras Firestore compartilhadas, publicadas e compiladas.
- Admin só é reconhecido após Google Sign-In mais permissão ativa.
- Motoristas não conseguem listar relatos privados ou outros usuários,
  nem aprovar, rejeitar ou criar permissões administrativas.
- Trilhas de auditoria imutáveis. Painel não permite exclusão de relatos.
- Auth Google habilitado sem desabilitar Auth Anonymous.
- Domínio do painel autorizado na configuração Firebase Auth.
- Faturamento desativado, sem Cloud Functions ou serviços pagos.
- Testes CI e testes estáticos Node passaram.
- Testes HTTP no Firestore: anônimo autenticou (200), mas recebeu 403
  ao tentar listar relatórios, listar admins, ler outro relato e aprovar.
- Quatro relatos reais continuam no banco, sem aprovações automáticas.
- Login real Google + aprovação administrativa dependerá da autorização
  inicial do UID acima.

## Publicação

Usar Firebase Hosting com site 'fuelpro-admin-832' e diretório de publicação
'admin/' no repositório. Fazer deploy apenas desse site, não do site dos
motoristas. Regras Firestore exigem testes para ambos os aplicativos.

## Futuras melhorias

Paginação de históricos, indicadores globais por cidade, prevenção de
spam, exportação e revisão dupla quando houver relatos conflitantes.
