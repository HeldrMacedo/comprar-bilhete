[
{"Domínio":"Sorteio/seleção","Nota":"B","Evidência":"concurso e filtro regional/estabelecimento implementados; inventário live não verificado","Próximo passo":"validar concurso ativo live"},
{"Domínio":"Carrinho","Nota":"B","Evidência":"manual/random v2, storage Zod e testes de página","Próximo passo":"ampliar conflito E2E"},
{"Domínio":"Checkout","Nota":"B","Evidência":"pedido typed, lock transacional e checkout com conta de cliente","Próximo passo":"validar credenciais InfinitePay live"},
{"Domínio":"Conta de cliente","Nota":"B","Evidência":"login com scrypt, sessão por cookie, códigos por e-mail, limites e E2E; POST /pessoa/cadastro não validado contra a API real","Próximo passo":"executar a Tarefa 0 do plano e configurar SMTP"},
{"Domínio":"Pagamento","Nota":"B","Evidência":"webhook idempotente, payment_check e revisão manual","Próximo passo":"teste sandbox/live controlado"},
{"Domínio":"Segurança","Nota":"B","Evidência":"reconciliação, preço no servidor e segredos fora do bundle","Próximo passo":"HTTPS, headers e auditoria operacional"},
{"Domínio":"E2E","Nota":"C","Evidência":"54 testes unit/integration; Playwright bloqueado por ENOMEM do host","Próximo passo":"reexecutar em CI/host com webServer"},
{"Domínio":"API externa","Nota":"C","Evidência":"/bilhete/disponiveis retornou HTTP 500 observado em 23/09/2026","Próximo passo":"investigar disponibilidade upstream"}
]
