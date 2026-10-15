# Fuel Pro | Firebase sem login obrigatório (Beta 6)

## Decisão de produto

Motorista **não precisa cadastrar senha, e-mail ou conta GitHub**.
O Firebase Authentication cria uma identidade anônima *somente quando
o motorista tenta enviar seu primeiro relato*. O mapa, consulta de
preços e navegação continuam sem autenticação. Administradores
terão acesso próprio e protegido em uma fase posterior.

A documentação do Firebase permite vincular uma conta anônima a
um login (como Google) sem perder o UID, se a vinculação for
feita corretamente. Portanto, não é necessário começar impondo
login aos motoristas.

## Banco de dados

Criar **projeto Firebase exclusivo para Fuel Pro** no plano Spark.
Não usar os Firestores existentes de ContaComigo ou Ponto Pessoal.

- `fuelpro_reports/{anonymousUid}_{cnpj}`: relato privado
  por usuário anônimo/CNPJ. Campos: `ownerUid`, `cnpj`,
  `city`, `kind`, `stationName`, `originalAddress`,
  `proposedAddress`, `notes`, `status` (sempre
  `pending` para o usuário), `createdAt`, `updatedAt`,
  `schemaVersion`.
- `fuelpro_admins/{uid}`: apenas administradores provisionados
  via Console Firebase ou SDK admin, **jamais pelo navegador**.
- Regras em `firebase/firestore.rules`: um usuário só consegue ler
  seu próprio relato. Somente admins podem listar, moderar e excluir.
  Atualização pelo motorista é limitada à sua própria sugestão ainda
  pendente, com intervalo mínimo de 60 segundos.
- As regras de segurança devem ser **publicadas antes** de ativar o
  envio na interface.

## Fluxo do motorista

1. Abre a ficha do posto e toca em **Confirmar endereço** ou
   **Sugerir correção**.
2. O relato é guardado como pendente no próprio navegador.
3. Se o Firebase estiver habilitado, o aplicativo faz autenticação
   anônima invisível e tenta gravar no Firestore.
4. Somente depois da resposta bem-sucedida de gravação,
   mostra **“Recebido pelo Firebase. Aguardando revisão”**.
5. Sem configuração ou sem conexão: mantém o rascunho local e
   informa a pendência. Não abre mais a interface GitHub para
   receber o relato; o GitHub segue como ferramenta técnica.

## Passos obrigatórios de ativação

1. Criar ou selecionar projeto EXCLUSIVO para Fuel Pro, confirmar
   **Spark**, verificar limites e ausência de faturamento pago.
2. Criar base Cloud Firestore (localização Brasil se disponível
   no plano e a escolha for adequada); nunca usar modo teste.
3. Em Authentication > Sign-in method, ativar **Anonymous**.
4. Registrar app Web e obter `apiKey`, `authDomain`,
   `projectId`, `appId` e opcional `storageBucket`.
   Essas configurações identificam o projeto e **não** são
   credenciais administrativas. Restringir chaves às APIs Firebase.
5. Configurar domínio autorizado do novo endereço PWA,
   quando necessário para a autenticação.
6. Publicar `firebase/firestore.rules` no projeto correto e
   **testar casos permitidos e negados no Rules Emulator**.
7. Provisionar o administrador em `fuelpro_admins` a partir
   do Console/Admin SDK e validar acesso, sem abrir gravação
   dessa coleção para usuários anônimos.
8. Para proteção contra abuso, avaliar App Check Web e
   limitar solicitações, conforme quotas e viabilidade Spark.
9. Só então editar `beta/firebase_config.js`:
   `enabled: true`, `config: {...}`.
10. Testar envio real no celular, mensagem de confirmação,
    falha de conexão, bloqueio de outro usuário e moderação.
11. Publicar nova Beta em endereço **separado** do PWA anterior.

### Estado atual

**Implementação em GitHub, não conectada a um projeto Firebase real.**
`beta/firebase_config.js` tem `enabled:false` para que
nenhuma gravação desprotegida aconteça por acidente.

Não foi criado projeto pago, cobrado serviço ou ativado
Cloud Functions. Sem habilitar e testar o projeto no console,
o envio permanece local, com aviso honesto de pendência.
O aplicativo já lançado anteriormente continua funcionando
normalmente.

## Alertas e limites

- Autenticação anônima não é prova de identidade real e não
  impede sozinha spam. Um usuário pode apagar os dados locais
  e obter outro UID. Considere App Check, limites e moderação.
- A proposta de um endereço **não altera automaticamente**
  ANP, preço, CNPJ ou coordenadas originais.
- As regras impedem leitura dos relatos privados por outros
  motoristas e mudança de status por usuários comuns.
- Nos planos gratuitos, atingir limites de operações pode
  interromper envios. Não ativar plano Blaze sem aprovação.
- LocalStorage e UID anônimo podem ser perdidos ao limpar
  armazenamento do navegador. Se houver login futuro,
  usar link de conta para preservar histórico.

Documentação oficial:
https://firebase.google.com/docs/auth/web/anonymous-auth
https://firebase.google.com/docs/firestore/security/get-started
https://firebase.google.com/docs/projects/api-keys
https://firebase.google.com/pricing
