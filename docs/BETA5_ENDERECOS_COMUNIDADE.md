# Fuel Pro Beta 5 | Endereços com validação comunitária

## Regra do projeto
Endereços do cadastro oficial ANP são a referência inicial. **Não é
necessário bloquear a consulta e o uso de rota por endereço por causa de
coordenadas ANP não verificadas**, desde que o motorista receba aviso
para conferir o destino antes de seguir. Nunca apresentar um relato
individual como validação oficial da agência.

## Funcionalidades
- **Confirmar endereço**: salva a confirmação desse usuário somente
  no navegador em que ele testou a Beta; não altera a ANP.
- **Sugerir correção**: permite informar rua/número e observação.
  O endereço sugerido passa a ser exibido para esse usuário, sem
  sobrescrever o arquivo `beta/dados.json`, a posição GPS oficial
  nem os valores de combustível.
- **Apagar meu registro**: restaura endereço ANP nesse navegador.
- **Enviar para revisão no GitHub**: abre um formulário de issue com CNPJ,
  endereço cadastral, sugestão e data. O usuário precisa estar conectado
  ao GitHub e clicar em publicar; abrir o formulário não envia nada.
  O repositório é **público**: não inserir telefone, CPF, foto pessoal
  ou dados de terceiros nas observações.
- **Compartilhar relato**: abre a função nativa de compartilhamento do
  aparelho, quando disponível, ou copia um texto para envio manual.
- **Abrir rota pelo endereço**: abre o Google Maps de consumidor usando
  um URL com o endereço textual, **sem Maps Platform nem Places API**.
  O Google Maps é responsável por resolver o destino; o motorista
  confirma o resultado visualmente antes de seguir.

## Limites de custo e confiança
- Nenhum token GitHub, credencial secreta ou API paga foi embutido no PWA.
- Cada domínio/navegador tem armazenamento local próprio. Se a Beta
  ganhar novo endereço de hospedagem, os relatos locais não migram
  automaticamente. Para persistência global, o usuário deve enviar
  ou compartilhar seu relato.
- **Confirmação pelo usuário** não significa comprovação em campo ou
  validação oficial. A data e o CNPJ ajudam na triagem posterior.
- A base ANP e o Fuel Score continuam separados das sugestões.
- Publicação de correções para todos exigirá moderação, histórico de
  alterações e prevenção de informações falsas. Isso ainda não está
  automatizado no MVP gratuito.
- Não coletamos localização GPS do usuário ao confirmar endereço.

## Testes
`node --test tests/community_feedback.test.cjs` cobre confirmação,
correção, armazenamento, exclusão, URL de rota, URL GitHub e rejeição
de registros falsificados. GitHub Actions executa esses testes junto
às checagens anteriores da Beta.
