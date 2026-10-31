# Contratos de API

## Backend próprio

O React usa apenas `/api`, encaminhado pelo Vite ao Fastify local.

- `GET /api/health` — saúde do servidor.
- `GET /api/v1/raffles/active` — lista de concursos ativos normalizados, sem bilhetes; `[]` quando ambos os blocos são ausentes ou expirados. Cada concurso inclui `purchaseEnabled`; é `false` quando a origem live usa HTTP sem `TICKET_API_ALLOW_HTTP=true`. Os campos opcionais `prizes` (lista ordenada), `luckySpins` (`count` e `label`) e `doubleChance` (booleano) alimentam os cards da Home; dados ausentes não são inventados. `hasBanner` indica que `banner_sorteiocap`/`banner_sorteioesp` está preenchido; a origem da imagem (`TICKET_BANNER_BASE_URL`, padrão `http://solidariedadesorte.ddns.net:8080`) não é exposta.
- `GET /api/v1/raffles/:id/banner` — repassa a imagem do banner de um concurso ativo (`Cache-Control: public, max-age=300`), evitando bloqueio de conteúdo misto HTTP em página HTTPS; `404` quando o concurso não tem banner. A Home mostra a imagem no carrossel e volta aos textos se ela não carregar. `prize` é o último prêmio preenchido de `prizes`, ou `Prêmios a confirmar` quando a lista estiver vazia.
- `GET /api/v1/raffles/{id}/cards` — bilhetes disponíveis normalizadas.
- `POST /api/v1/orders` — exige sessão de cliente; cria pedido e reserva localmente os bilhetes. O comprador vem da conta (nome, CPF, celular, e-mail e endereço); o corpo traz apenas `raffles` (ou o formato de um concurso), `beneficiaryName` e `email` do pedido (padrão: e-mail da conta). Campo `customer` no corpo é ignorado. Sem sessão: `401 UNAUTHENTICATED`; conta sem cadastro completo: `400 PROFILE_INCOMPLETE`.
- `GET /api/v1/orders/mine` — "Minhas compras": exige sessão de cliente, sem corpo nem CPF na requisição, `Cache-Control: no-store`, e devolve `{ "orders": [...] }` com até 20 pedidos do CPF da conta, do mais recente ao mais antigo. Cada pedido traz os campos públicos do pedido mais `createdAt`, `paidAt`, `paymentMethod` (`capture_method` da InfinitePay, por exemplo `pix`) e `checkoutUrl` apenas quando `pending`. Só pedido `paid` traz, para o comprovante, `customer` (`name` do titular, que é `beneficiaryName` quando houver, `city`, `phone` e `cpf`) e, em cada item validado, `identification`, `drawDate`, `prizes`, `luckySpins`, `validationBatch` e `batchPosition`; item `not_validated` não traz esses dados. Os demais status nunca devolvem dados pessoais. Sem sessão: `401 UNAUTHENTICATED`.
- `POST /api/v1/orders/{id}/checkout` — cria ou reutiliza o link InfinitePay.
- `GET /api/v1/orders/{id}` — consulta status seguro do pedido.
- `GET /api/v1/orders/{id}?transaction_nsu=&slug=` — reconcilia o redirect na InfinitePay.
- `POST /api/v1/webhooks/infinitepay` — persiste notificação e agenda reconciliação.
- `GET /api/v1/site-settings` — `{ "youtubeVideoId": string | null }` para a seção "Assista ao sorteio" da Home.
- `GET /api/v1/zip-codes/{cep}` — CEP com 8 dígitos; `{ "address": { "zipCode", "street", "neighborhood", "city", "state" } }` com `Cache-Control: public, max-age=86400`. `street` e `neighborhood` vêm vazios em CEP geral de cidade. `404 ZIP_CODE_NOT_FOUND`, `502 ZIP_CODE_UNAVAILABLE` (BrasilAPI fora do ar ou fora do contrato), `400` para formato inválido e `429 RATE_LIMITED` acima de `ZIP_CODE_LIMIT_PER_MINUTE` (padrão 30) por IP. Com `ZIP_CODE_PROVIDER=brasilapi` consulta `GET {BRASIL_API_BASE_URL}/api/cep/v2/{cep}` (timeout de 8 s); com `mock` só conhece `59062300`. Só preenche o formulário: a falha nunca bloqueia o cadastro.

### Conta de cliente

Todas as rotas `/api/v1/account/*` respondem com `Cache-Control: no-store`. Métodos de escrita com `Origin` diferente de `PUBLIC_APP_URL` recebem `403 FORBIDDEN_ORIGIN`. A sessão é o cookie `customer_session` (`HttpOnly`, `SameSite=Strict`, `Path=/api`, `Secure` quando `PUBLIC_APP_URL` é HTTPS), definido em `login`, `register` e `password`; expira após 30 dias sem uso no servidor. CPF tem 11 dígitos; senha, de 8 a 128 caracteres. Corpo inválido: `400` com `message` "Dados inválidos." e `issues`, sem `code`. Falha da API de bilhetes: `502 UPSTREAM_ERROR`, sem efeito local.

- `POST /api/v1/account/identify` — `{ "cpf" }`; devolve `{ "status": "account" }` (há conta no site: pedir senha), `{ "status": "first_access", "maskedEmail": "jo***@gmail.com" }` (CPF na API com e-mail), `{ "status": "no_email" }` (CPF na API sem e-mail) ou `{ "status": "new" }`. Revela se o CPF está cadastrado. Limite por IP de `ACCOUNT_IDENTIFY_LIMIT_PER_MINUTE` (padrão 10) por minuto: `429 RATE_LIMITED`.
- `POST /api/v1/account/codes` — `{ "cpf", "purpose": "first_access" | "reset" }`; `202` sem corpo. `first_access` e `reset` enviam sempre ao e-mail do cadastro (API; se ela não tiver, o da conta local), nunca a um e-mail do corpo. Erros: `409 ACCOUNT_EXISTS` (`first_access` com conta), `409 ACCOUNT_NOT_FOUND` (`reset` sem conta), `409 EMAIL_NOT_REGISTERED` (cadastro sem e-mail), `429 CODE_RESEND_TOO_SOON` (menos de 60 s do último código da mesma finalidade), `503 MAIL_UNAVAILABLE` (falha ou tempo esgotado no SMTP). Limite por IP de `ACCOUNT_CODE_LIMIT_PER_MINUTE` (padrão 5) por minuto: `429 RATE_LIMITED`. Código: 6 dígitos, 15 minutos, guardado só como hash; um código novo invalida os anteriores da mesma finalidade.
- `POST /api/v1/account/login` — `{ "cpf", "password" }`; `{ "account" }` e cookie. CPF ou senha errados: `401 INVALID_CREDENTIALS`, sem distinguir. Após 10 falhas por minuto no IP ou 5 em 15 minutos no CPF, `429 RATE_LIMITED`.
- `POST /api/v1/account/register` — `{ "customer": { "name", "cpf", "phone", "email"?, "address" }, "password" }`; `201 { "account" }` e cookie. `email` (omitido ou `null`) e `address.zipCode` são opcionais; rua, número, bairro, cidade e UF são obrigatórios. Conta sem e-mail segue as regras do cadastro sem e-mail (recuperação só pelo código do admin). Sem código: o e-mail informado não é confirmado. Chama `POST /pessoa/cadastro`, relê `GET /pessoa/cpf/{cpf}` para obter o `externalId` e só então cria conta local e sessão. Se a API falhar, nada local é criado. `409 ACCOUNT_EXISTS` (CPF com conta ou na API), `502 CUSTOMER_NOT_REGISTERED` (cadastro não localizado após criação). Limite por IP de `ACCOUNT_CODE_LIMIT_PER_MINUTE` (padrão 5) cadastros por minuto: `429 RATE_LIMITED`.
- `POST /api/v1/account/password` — `{ "cpf", "code", "password", "email"? }`; `{ "account" }` e cookie. Serve ao primeiro acesso, ao "esqueci a senha" e ao código do admin: envia a senha para `/pessoa/cadastro`, grava o hash local, encerra as demais sessões do CPF e cria uma nova. Com código do admin, o e-mail vale só quando nem a API nem a conta têm um; sem e-mail disponível: `400 EMAIL_REQUIRED`. `400 INVALID_CODE`, `404 CUSTOMER_NOT_FOUND`. Mesmos limites de falha de `register`.
- `GET /api/v1/account/me` — `{ "account" }` ou `401 UNAUTHENTICATED`. `account`: `cpf`, `name`, `email` (ou `null`), `phone`, `address` (quando houver) e `complete` (cadastro completo para comprar). O mesmo formato vale para `login`, `register`, `password` e `profile`. Hash de senha e `externalId` (`pessoas_id` da API, usado só pelo backend) nunca são expostos.
- `PUT /api/v1/account/profile` — `{ "customer": { "name", "phone", "email"?, "address" }, "currentPassword" }`, com `email` e `address.zipCode` opcionais como no cadastro; devolve `{ "account" }`. O CPF não muda. Confere a senha atual (`401 INVALID_CREDENTIALS`, que não derruba a sessão) e regrava o cadastro na API com ela; se a API falhar, a conta local não muda. `401 UNAUTHENTICATED` sem sessão.
- `POST /api/v1/account/logout` — apaga a sessão e o cookie; `204`, mesmo sem sessão.

Códigos de erro de conta: `INVALID_CREDENTIALS`, `INVALID_CODE`, `CODE_RESEND_TOO_SOON`, `ACCOUNT_EXISTS`, `ACCOUNT_NOT_FOUND`, `EMAIL_NOT_REGISTERED`, `EMAIL_REQUIRED`, `MAIL_UNAVAILABLE`, `UNAUTHENTICATED`, `PROFILE_INCOMPLETE` (em `POST /api/v1/orders`), `RATE_LIMITED` e, no painel, `CUSTOMER_HAS_EMAIL`. Os limites vivem em memória por processo; atrás de proxy exigem `TRUST_PROXY` (ver `.env.example`), senão valem para o site inteiro.

### Painel administrativo

Todas as rotas abaixo respondem com `Cache-Control: no-store`. Métodos de escrita com `Origin` diferente de `PUBLIC_APP_URL` recebem `403 ADMIN_FORBIDDEN_ORIGIN`.

- `POST /api/v1/admin/session` — `{ "login", "password" }`; devolve `{ "user" }` e grava o cookie `admin_session` (`HttpOnly`, `SameSite=Strict`, `Path=/api/v1/admin`, `Secure` quando `PUBLIC_APP_URL` é HTTPS). Credencial inválida ou usuário inativo: `401 ADMIN_INVALID_CREDENTIALS`, sem revelar qual. Após 10 tentativas com falha no mesmo minuto, o IP recebe `429 RATE_LIMITED` até a janela acabar; login correto não consome o limite.
- `GET /api/v1/admin/session` — `{ "user" }` ou `401 ADMIN_UNAUTHENTICATED`.
- `DELETE /api/v1/admin/session` — encerra a sessão; `204`.
- `GET /api/v1/admin/users` — `{ "users": [...] }` com `id`, `login`, `name`, `active`, `createdAt`, `updatedAt`. Hash de senha nunca é exposto.
- `POST /api/v1/admin/users` — `{ "login", "name", "password" }`; `201 { "user" }`. Login em minúsculas (3–40 caracteres `a-z0-9._-`), senha de 12 a 128 caracteres; login repetido: `409 ADMIN_LOGIN_TAKEN`.
- `PATCH /api/v1/admin/users/{id}` — campos opcionais `login`, `name`, `password`, `active`. Não permite desativar a si mesmo nem o último ativo (`409`). Trocar senha encerra as outras sessões do usuário; desativar encerra todas.
- `DELETE /api/v1/admin/users/{id}` — `204`; não exclui a si mesmo nem o último ativo (`409`).

- `GET /api/v1/admin/dashboard` — `totals` (`customers`: CPFs distintos com pedido; `paidTickets`, `paidOrders` e `revenueInCents` de pedidos `paid`, sem contar bilhetes não validados; `pendingTickets` e `pendingOrders` de pedidos `pending` não expirados; `manualReviewOrders`; `refundDueInCents`, o valor a estornar manualmente), `dailySales` (30 dias até hoje no fuso `America/Fortaleza`, pela data de pagamento, dias sem venda com zero), `ordersByStatus`, `ticketsByRaffle` (bilhetes pagos e receita por concurso de cada bilhete) e `upcomingRaffles` (concursos ativos do gateway, com bilhetes vendidos no site). Se a API de bilhetes falhar, `upcomingRaffles` é `null` e `upcomingRafflesError` explica; os indicadores locais continuam.
- `GET /api/v1/admin/orders?q=&status=&from=&to=&page=&pageSize=` — `{ page, pageSize, total, orders }`, do mais recente ao mais antigo; `pageSize` até 100 (padrão 20). `q` busca por nome (comprador ou terceiro), CPF ou celular (a partir de 3 dígitos), início do ID do pedido, código, ID ou identificação do bilhete. `from`/`to` (`AAAA-MM-DD`) são dias no fuso `America/Fortaleza`, ambos inclusivos. Cada pedido traz `customer` com nome, CPF, celular e `beneficiaryName`, além de `captureMethod` (`manual` para baixa no painel), `lastError` e `emailStatus` opcional (`pending | sent | failed | no_recipient`, estado do e-mail dos bilhetes; ausente em pedido nunca pago e em pedido pago antes da fila existir, anterior à migração v9).
- `GET /api/v1/admin/orders/export` — mesmos filtros, sem paginação; CSV (`;`, UTF-8 com BOM, CRLF, valores com vírgula decimal, células iniciadas por `=`, `+`, `-` ou `@` prefixadas com `'`). Mais de 20.000 linhas: `413 EXPORT_TOO_LARGE`. Cada exportação é auditada com os filtros.
- `POST /api/v1/admin/orders/{id}/approve` — `{ "reason" }` (5 a 500 caracteres). `pending` com reserva ativa: registra `captureMethod = manual` e entrega pelo mesmo fluxo do webhook, resultando em `paid` ou `manual_review`. `manual_review`: confere se cada bilhete continua disponível na API (`409 TICKET_UNAVAILABLE` se não), reocupa a reserva local e tenta a entrega de novo, mantendo as posições de lote já atribuídas. Outros status ou reserva perdida: `409`. Devolve `{ "order" }`.
- `POST /api/v1/admin/orders/{id}/cancel` — `{ "reason" }`. `pending`: libera reservas local e externa. `manual_review`: marca `cancelled` sem estorno (feito fora do sistema). Outros status: `409`.
- `POST /api/v1/admin/orders/{id}/resend-email` — `{ "reason" }` (5 a 500 caracteres). Coloca de novo na fila o e-mail dos bilhetes de pedido `paid` (inclusive pago antes de a fila existir); devolve `200 { "order" }`. `409 ORDER_NOT_PAID` (pedido não pago), `409 EMAIL_NO_RECIPIENT` (cliente sem e-mail) ou `409 EMAIL_ALREADY_QUEUED` (já há envio na fila ou em andamento); `404` se o pedido não existe. Auditado como `order.resend_email`.
- `GET /api/v1/admin/customers?q=&purchase=paid|unpaid&from=&to=&page=&pageSize=` — um cliente por CPF, derivado dos pedidos locais: nome, celular e endereço do pedido mais recente, `orderCount`, `paidOrderCount`, `paidTotalInCents`, `ticketCount` (bilhetes pagos), `firstOrderAt`, `lastOrderAt`. `from`/`to` filtram o último pedido.
- `GET /api/v1/admin/customers/export` — mesmos filtros; CSV no mesmo formato da exportação de vendas.
- `POST /api/v1/admin/customers/{cpf}/access-code` — gera o código de primeiro acesso (finalidade `admin`) para CPF sem e-mail no cadastro; devolve `{ "code", "expiresAt" }` (24 horas), mostrado uma única vez e guardado só como hash. O cliente o informa em `POST /api/v1/account/password`. Auditado como `customer.access_code`. `404 CUSTOMER_NOT_FOUND` se o CPF não existe na API nem no site; `409 CUSTOMER_HAS_EMAIL` se a API ou a conta já têm e-mail. No painel, `/admin/clientes` gera o código pela linha do cliente ou por "CPF do cliente" digitado, para quem não tem pedido no site (por exemplo, quem só compra na lotérica).

- `GET /api/v1/admin/raffles` — `{ raffles }` com os concursos do registro atual da API de bilhetes: `source` (`cap` = quarta, `esp` = domingo), `contestId`, `salesStartAt`, `salesEndAt` (`AAAA-MM-DDTHH:MM`), `drawDate`, `drawTime`, `priceInCents`, `prizes` (até 5), `luckySpinsCount`, `luckySpinsLabel`, `doubleChance`. Datas e horas são locais de `America/Fortaleza`, como a API guarda.
- `PUT /api/v1/admin/raffles/{cap|esp}` — mesmos campos (sem `source`/`contestId`). Valida início antes do fim das vendas, fim até o horário do sorteio, de 1 a 5 prêmios e preço inteiro em centavos. Grava na API de bilhetes (ver "Escrita") e devolve `{ raffle }`; se a releitura não confirmar os valores, `502 UPSTREAM_NOT_APPLIED`. Auditado com valores antes e depois.
- `GET`/`PUT /api/v1/admin/settings` — `{ youtubeVideoId, youtubeUrl }`; o `PUT` recebe `{ "youtubeUrl" }`. Só aceita `https` em `youtube.com`, `www.youtube.com`, `m.youtube.com` ou `youtu.be` (`watch?v=`, `/embed/`, `/shorts/`, `/live/` ou link curto) e guarda apenas o ID de 11 caracteres; vazio remove o vídeo. Link inválido: `400 INVALID_YOUTUBE_URL`.

Sem sessão válida, rotas protegidas devolvem `401 ADMIN_UNAUTHENTICATED`. A sessão expira após 8 horas sem uso e, em qualquer caso, 24 horas após o login.

Entrada de pedido com um ou dois concursos:

```json
{
  "raffles": [
    { "raffleId": "2026040", "selection": { "mode": "manual", "cardIds": ["000123"] } },
    { "raffleId": "2026041", "selection": { "mode": "random", "quantity": 2 } }
  ],
  "email": "maria@example.com",
  "beneficiaryName": "João Terceiro"
}
```

O comprador é sempre o dono da sessão: nome, CPF, telefone e endereço vêm da conta (que já está em `pessoa`); o backend monta o `customer` do pedido e `resolveForOrder` relê a pessoa na API para obter o `externalId`. `email` é opcional e vale para o pedido e para o checkout da InfinitePay; se omitido, usa o e-mail da conta. `beneficiaryName` é opcional e só é enviado quando a compra é para outra pessoa; não cria cadastro, apenas define o `nome` gravado no bilhete.

O formato de um concurso continua aceito:

```json
{
  "raffleId": "2024029",
  "selection": { "mode": "manual", "cardIds": ["000123", "000456"] }
}
```

Para surpresinha, `selection` deve ser `{ "mode": "random", "quantity": 3 }`, com
quantidade inteira entre 1 e 50. O backend ignora o preço do navegador, consulta o
concurso ativo, relê o comprador na API, atribui os bilhetes e recalcula o total. As
reservas de ambos os concursos são criadas em uma transação e resultam em um pedido e
um checkout. Cada item da resposta inclui `raffleId`, `raffleTitle` e `unitPriceInCents`.
A resposta pública inclui `items`, `selectionMode`, `unitPriceInCents`, `totalInCents`
e `expiresAt`; metadados internos de validação dos bilhetes não são expostos. Status
públicos: `pending`, `processing`, `paid`, `expired`, `cancelled`, `manual_review` e
`not_validated`.

### Pagamento após o fim das vendas

O código Pix da InfinitePay vale 72 horas, então o pagamento pode chegar depois do fim
das vendas do concurso (`salesEndAt`, de `data_fim_sorteiocap`/`data_fim_sorteioesp`;
exposto em concursos e itens do pedido). Bilhete cujo pagamento chegou ao servidor em
`payment_received_at >= salesEndAt` não é validado: fica com `validationStatus:
'not_validated'`, a reserva é liberada e ele não vai para `PUT /bilhete/validar`, e-mail
nem PDF. Bilhete sem `salesEndAt` (pedidos antigos, concursos mock) não é checado.

- A hora é a do servidor, nunca a do navegador: o menor entre o `payment_events.created_at`
  do mesmo `transaction_nsu` + `invoice_slug` confirmado por `payment_check` e a chegada do
  redirect; gravada uma vez em `orders.payment_received_at`. Baixa manual usa o horário do clique.
  Retry de `manual_review` antigo sem horário usa o menor `payment_events.created_at`; sem evento, não há checagem.
- Todos atrasados: pedido `not_validated` (não `manual_review`), sem e-mail.
- Parcial: pedido `paid`, só os bilhetes válidos entregues; os atrasados ficam `not_validated`.
- Pedido expirado/cancelado pago dentro do prazo continua `manual_review`.
- Pedido de um concurso expira no máximo em `salesEndAt` (o agrupado já fazia isso).
- O pedido traz `refundDueInCents` quando maior que 0 e `message` para `not_validated` e parcial.
- Admin: filtro de status `not_validated`; itens com `validationStatus`; CSV com coluna
  "A estornar (R$)"; receita, `paidTickets`, `dailySales` e `ticketsByRaffle` não contam bilhetes
  não validados. Admin não aprova nem cancela pedido `not_validated`.

## InfinitePay

### Criar checkout

`POST https://api.checkout.infinitepay.io/links` com `handle`, `order_nsu`, `redirect_url`, `webhook_url`, cliente e itens em centavos. Resposta validada: `{ "url": "https://checkout.infinitepay.com.br/..." }`.

### Confirmar pagamento

`POST https://api.checkout.infinitepay.io/payment_check` com `handle`, `order_nsu`, `transaction_nsu` e `slug`. O backend exige `success=true`, `paid=true` e `amount` exatamente igual ao total persistido.

### Webhook

Recebe `invoice_slug`, `amount`, `paid_amount`, `capture_method`, `transaction_nsu`, `order_nsu`, `receipt_url` e itens. O evento não libera bilhetes sozinho; ele é persistido e reconciliado em `payment_check`.

## API externa de bilhetes

Auditada em 20/09/2026 contra `http://66.94.99.64:9090/swagger/doc/json`. Em uma consulta de 25/09/2026, `/concurso/atual` respondeu `404` com `{"error":"Nenhum concurso ativo encontrado"}`. Em nova consulta no mesmo dia, a rota voltou a responder com uma lista contendo um objeto com os blocos `sorteiocap` e `sorteioesp`. O parser também aceita esse objeto diretamente. Cada bloco possui ID, data, hora, prazo e preço próprios. ID terminado em `000` (por exemplo, `2026000`) representa ausência de sorteio nesse bloco e não pode ser exibido nem vendido.

Na amostra da nova resposta, CAP tinha ID `2026041` com sorteio em 27/09/2026 (domingo), enquanto ESP tinha ID `2026040` com sorteio em 23/09/2026 (quarta) e `data_fim_sorteioesp` já passada. O dia exibido é derivado de `data_sorteio*`, sem associar CAP/ESP a um dia fixo. Um concurso deixa de ser oferecido quando sua `data_fim_*`, incluindo o horário em `America/Fortaleza`, é atingida. A listagem de bilhetes disponíveis para ambos os IDs retornou `count: 0` no estabelecimento `4734`.

A origem atualmente informada usa HTTP e não respondeu via HTTPS em 25/09/2026. O backend permite ler concursos e bilhetes públicos nesse endereço, mas bloqueia consulta de CPF/telefone, criação de pedido e validação de bilhetes. Com `TICKET_API_ALLOW_HTTP=true`, o backend libera essas operações pela origem HTTP e registra um aviso no startup; CPF e telefone trafegam sem TLS entre o backend e a API de bilhetes. O padrão continua `false`.

### Leitura

- `GET /concurso/atual` e `GET /concurso/{id}`.
- `GET /bilhete/disponiveis?concurso_id=&estabelecimento_id=&pagina=`.
- `GET /pessoa/cpf/{cpf}` — única consulta de pessoa usada pelo backend.

Os campos `reservado`, `data_reservado` e `validado` são opcionais na listagem e na consulta por número. Quando presentes, bilhetes validados ou com reserva dentro de `TICKET_RESERVATION_TTL_MINUTES` não são oferecidas.

O valor do bilhete chega em reais e é convertido para centavos. Em 25/09/2026, com o concurso 2026041 ativo, `/bilhete/disponiveis` devolveu itens com `numero`, `lote_validacao: ""`, `posicao_lote: 0` e as dezenas em `dezenas` como texto separado por `|` (por exemplo, `"3|6|16"`), além de `dezenas2`, `numero2` e `identificacao`. O provider aceita `posicao_lote` zero e lê as dezenas de `numeros` (array) ou de `dezenas` (primeira chance) e as de `dezenas2` (segunda chance), expostas como `secondChanceNumbers` nos bilhetes e nos itens de pedido. Pedidos gravados antes disso não têm a segunda chance e a devolvem vazia. O `identificacao` (por exemplo, `60410080001-22`) é guardado em cada bilhete do pedido como número do bilhete no comprovante. Prêmios (`premio_01..05_sorteio*`, sem os vazios), giros (`qtd_giros_sorteio*` e `giros_sorteio*`) e data do sorteio também são copiados para os bilhetes na criação do pedido. `/bilhete/disponivel/numero` devolve o item em `bilhete` (não em `data`), com `encontrado` e `disponivel`; `disponivel: false` é tratado como indisponível, e bilhete não distribuído responde `404`.

### Escrita

- `POST /pessoa/cadastro` — cadastra ou edita a pessoa (usado por cadastro, primeiro acesso, troca de senha e edição de perfil). O backend envia `nome`, `cpf`, `senha`, `confirma_senha`, `email` (vazio quando não há), `fone`, `cep` (omitido quando não há), `endereco`, `numero`, `complemento`, `bairro`, `cidade` e `uf`. Em 26/10/2026 um cadastro novo sem `cep` e com `email: ""` respondeu `201` (`{ success, message, data: { pessoas_id, nome, cpf } }`) e a releitura devolveu `cep: ""`, `email: ""` e os campos de endereço gravados; a releitura converte `cep: ""` em endereço sem `zipCode`. **Edição ainda não validada contra a API real** (Tarefa 0 do plano `2026-10-16-login-cliente` pendente): o swagger só traz `nome`, `cpf`, `senha`, `confirma_senha`, `email`, `fone`, `cidade` e `cep`; falta confirmar se os campos extras de endereço são aceitos e gravados, se a edição exige reenviar a senha, se campos omitidos são apagados e o formato da resposta (o backend não depende do ID nela, relê `GET /pessoa/cpf/{cpf}`). Com origem HTTP e sem `TICKET_API_ALLOW_HTTP=true`, a chamada é bloqueada.
- `POST /pessoa` com `nome`, `cpf` e `fone` — rota anterior, ainda usada como reserva por `CustomerService.ensureRegistered` na entrega de um pedido pago quando o comprador não tem `externalId` e não é encontrado em `GET /pessoa/cpf/{cpf}` (por exemplo, pedido anterior ao login de cliente ou pessoa removida da API).
- `PUT /bilhete/validar` com `numero`, `concurso_id`, `lote_validacao`, `estabelecimento_id` e `posicao_lote` — campos obrigatórios confirmados por respostas de validação da API. O backend envia também `pessoas_id` (ID do comprador em `pessoa`) e `nome` (`beneficiaryName` quando a compra é para terceiro; senão o nome do comprador), campos opcionais segundo o swagger. O `pessoas_id` vem da pessoa já cadastrada pela conta (relida em `GET /pessoa/cpf/{cpf}`); o cadastro acontece em `POST /pessoa/cadastro` quando a conta é criada, não mais após o pagamento.
- `PUT /concurso/{id}` — usado pelo painel. O swagger não documenta o corpo; o backend lê `GET /concurso/atual`, troca só os campos `*_sorteiocap` ou `*_sorteioesp` do concurso editado (`data_inicio_*`, `data_fim_*` como `AAAA-MM-DD HH:MM:SS`, `data_*`, `hora_*`, `valor_bilhete_*` decimal, `qte_premios_*`, `premio_01..05_*` com `null` nos vazios, `qtd_giros_*`, `giros_*` (`"0"` sem giros) e `dupla_chance_*` 0/1), envia o registro inteiro e relê para confirmar. Formato ainda não validado contra a API real.
- `PUT /bilhete/reservado` e `GET /bilhete/reservado?concurso_id=&numero=&estabelecimento_id=` — **provisório, ainda não publicado**. Reserva com `reservado: true` e recebe `data_reservado` (token); libera com `reservado: false` e o `data_reservado` recebido. `409` indica bilhete já reservada/validada ou token que não é o dono. Contrato detalhado em [design-docs/2026-09-27-concorrencia-reserva-bilhete.md](design-docs/2026-09-27-concorrencia-reserva-bilhete.md).

## Limitações conhecidas

- O estabelecimento é fixo em `4734` para a regional `57`; a API de bilhetes recebe `estabelecimento_id`, não `id_regional`.
- Não havia concurso/bilhete ativo em 25/09/2026 para validar o formato dos itens.
- A reserva externa em `bilhete.reservado` está implementada no backend e desligada (`TICKET_RESERVATION_PROVIDER=none`) até a API de bilhetes publicar os endpoints. Não há venda atômica de várias bilhetes; o backend compensa reservas parciais.
- Uma falha após pagamento coloca o pedido em `manual_review`; operação precisa reconciliar entrega ou estorno.
- O estorno de bilhete `not_validated` é manual, fora do sistema; o sistema só informa `refundDueInCents`.
