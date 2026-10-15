# Fuel Pro | Firebase sem login obrigatório

## Decisão de produto
- Consulta de mapa, postos e preços pública e sem login.
- Confirmação/correção de endereço sem tela de cadastro.
- Autenticação anônima do Firebase apenas no momento de enviar o primeiro relato.
- Administração e moderação com login obrigatório e papéis restritos.
- Não solicitar GPS, telefone, CPF ou e-mail para relatos.
- Login opcional de motorista fica para uma etapa futura.

## Implementação planejada
1. Criar projeto Firebase dedicado no plano Spark, sem ativar faturamento.
2. Habilitar Authentication > Anonymous e Cloud Firestore.
3. Criar coleção `station_reports` com campos: `cnpj`, `kind`, `originalAddress`, `proposedAddress`, `notes`, `createdAt` (timestamp do servidor), `authorUid`, `status` (pendente).
4. Regras Firestore: apenas usuário autenticado anonimamente pode criar relato próprio; bloquear escrita de `status` arbitrário, edições e exclusões pelo cliente; bloquear leitura de relatos alheios; só moderadores aprovam.
5. Aplicar App Check e medidas de redução de spam; regras Firestore sozinhas não garantem rate limiting por IP.
6. Mostrar sucesso somente após confirmação de gravação; manter pendência local em caso de erro e oferecer nova tentativa.
7. Jamais incorporar chave de serviço/admin no frontend. Configuração web pública do Firebase não é chave administrativa.
8. Não promover relato a endereço oficial automaticamente. Aprovação com trilha de auditoria.

## Critérios de publicação
- Verificar plano Spark e cotas no console.
- Testar envio anônimo e negação de leituras/edições não autorizadas.
- Testar offline, erros de rede, duplicidade e moderação.
- Remover o GitHub do fluxo do motorista só quando o backend estiver efetivamente operacional.
