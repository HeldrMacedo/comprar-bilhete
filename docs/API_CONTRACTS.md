# Contratos de API

## Backend próprio

O React usa apenas `/api`, encaminhado pelo Vite ao Fastify local.

- `GET /api/health` — saúde do servidor.
- `GET /api/v1/customers/lookup?cpf=` — consulta cadastro somente por CPF (11 dígitos); telefone não é critério de busca.
- `GET /api/v1/raffles/active` — lista de concursos ativos normalizados, sem bilhetes; `[]` quando ambos os blocos são ausentes ou expirados. Cada concurso inclui `purchaseEnabled`; é `false` quando a origem live usa HTTP sem `TICKET_API_ALLOW_HTTP=true`. Os campos opcionais `prizes` (lista ordenada), `luckySpins` (`count` e `label`) e `doubleChance` (booleano) alimentam os cards da Home; dados ausentes não são inventados.
- `GET /api/v1/raffles/{id}/cards` — bilhetes disponíveis normalizadas.
- `POST /api/v1/orders` — cria pedido e reserva localmente os bilhetes.
- `POST /api/v1/orders/lookup` — "Minhas compras": recebe `{ "cpf": "52998224725" }` no corpo e devolve `{ "orders": [...] }` com até 20 pedidos do CPF, do mais recente ao mais antigo. Cada pedido traz os campos públicos do pedido mais `createdAt`, `paidAt`, `paymentMethod` (`capture_method` da InfinitePay, por exemplo `pix`) e `checkoutUrl` apenas quando `pending`. Só pedido `paid` traz, para o comprovante, `customer` (`name` do titular, que é `beneficiaryName` quando houver, `city`, `phone` e `cpf`) e, em cada item, `identification`, `drawDate`, `prizes`, `luckySpins`, `validationBatch` e `batchPosition`. Os demais status nunca devolvem dados pessoais. Limite de 10 consultas por minuto por IP (`429 RATE_LIMITED`).
- `POST /api/v1/orders/{id}/checkout` — cria ou reutiliza o link InfinitePay.
- `GET /api/v1/orders/{id}` — consulta status seguro do pedido.
- `GET /api/v1/orders/{id}?transaction_nsu=&slug=` — reconcilia o redirect na InfinitePay.
- `POST /api/v1/webhooks/infinitepay` — persiste notificação e agenda reconciliação.
- `GET /api/v1/site-settings` — `{ "youtubeVideoId": string | null }` para a seção "Assista ao sorteio" da Home.

### Painel administrativo

Todas as rotas abaixo respondem com `Cache-Control: no-store`. Métodos de escrita com `Origin` diferente de `PUBLIC_APP_URL` recebem `403 ADMIN_FORBIDDEN_ORIGIN`.

- `POST /api/v1/admin/session` — `{ "login", "password" }`; devolve `{ "user" }` e grava o cookie `admin_session` (`HttpOnly`, `SameSite=Strict`, `Path=/api/v1/admin`, `Secure` quando `PUBLIC_APP_URL` é HTTPS). Credencial inválida ou usuário inativo: `401 ADMIN_INVALID_CREDENTIALS`, sem revelar qual. Após 10 tentativas com falha no mesmo minuto, o IP recebe `429 RATE_LIMITED` até a janela acabar; login correto não consome o limite.
- `GET /api/v1/admin/session` — `{ "user" }` ou `401 ADMIN_UNAUTHENTICATED`.
- `DELETE /api/v1/admin/session` — encerra a sessão; `204`.
- `GET /api/v1/admin/users` — `{ "users": [...] }` com `id`, `login`, `name`, `active`, `createdAt`, `updatedAt`. Hash de senha nunca é exposto.
- `POST /api/v1/admin/users` — `{ "login", "name", "password" }`; `201 { "user" }`. Login em minúsculas (3–40 caracteres `a-z0-9._-`), senha de 12 a 128 caracteres; login repetido: `409 ADMIN_LOGIN_TAKEN`.
- `PATCH /api/v1/admin/users/{id}` — campos opcionais `login`, `name`, `password`, `active`. Não permite desativar a si mesmo nem o último ativo (`409`). Trocar senha encerra as outras sessões do usuário; desativar encerra todas.
- `DELETE /api/v1/admin/users/{id}` — `204`; não exclui a si mesmo nem o último ativo (`409`).

- `GET /api/v1/admin/dashboard` — `totals` (`customers`: CPFs distintos com pedido; `paidTickets`, `paidOrders` e `revenueInCents` de pedidos `paid`; `pendingTickets` e `pendingOrders` de pedidos `pending` não expirados; `manualReviewOrders`), `dailySales` (30 dias até hoje no fuso `America/Fortaleza`, pela data de pagamento, dias sem venda com zero), `ordersByStatus`, `ticketsByRaffle` (bilhetes pagos e receita por concurso de cada bilhete) e `upcomingRaffles` (concursos ativos do gateway, com bilhetes vendidos no site). Se a API de bilhetes falhar, `upcomingRaffles` é `null` e `upcomingRafflesError` explica; os indicadores locais continuam.
- `GET /api/v1/admin/orders?q=&status=&from=&to=&page=&pageSize=` — `{ page, pageSize, total, orders }`, do mais recente ao mais antigo; `pageSize` até 100 (padrão 20). `q` busca por nome (comprador ou terceiro), CPF ou celular (a partir de 3 dígitos), início do ID do pedido, código, ID ou identificação do bilhete. `from`/`to` (`AAAA-MM-DD`) são dias no fuso `America/Fortaleza`, ambos inclusivos. Cada pedido traz `customer` com nome, CPF, celular e `beneficiaryName`, além de `captureMethod` (`manual` para baixa no painel) e `lastError`.
- `GET /api/v1/admin/orders/export` — mesmos filtros, sem paginação; CSV (`;`, UTF-8 com BOM, CRLF, valores com vírgula decimal, células iniciadas por `=`, `+`, `-` ou `@` prefixadas com `'`). Mais de 20.000 linhas: `413 EXPORT_TOO_LARGE`. Cada exportação é auditada com os filtros.
- `POST /api/v1/admin/orders/{id}/approve` — `{ "reason" }` (5 a 500 caracteres). `pending` com reserva ativa: registra `captureMethod = manual` e entrega pelo mesmo fluxo do webhook, resultando em `paid` ou `manual_review`. `manual_review`: confere se cada bilhete continua disponível na API (`409 TICKET_UNAVAILABLE` se não), reocupa a reserva local e tenta a entrega de novo, mantendo as posições de lote já atribuídas. Outros status ou reserva perdida: `409`. Devolve `{ "order" }`.
- `POST /api/v1/admin/orders/{id}/cancel` — `{ "reason" }`. `pending`: libera reservas local e externa. `manual_review`: marca `cancelled` sem estorno (feito fora do sistema). Outros status: `409`.
- `GET /api/v1/admin/customers?q=&purchase=paid|unpaid&from=&to=&page=&pageSize=` — um cliente por CPF, derivado dos pedidos locais: nome, celular e endereço do pedido mais recente, `orderCount`, `paidOrderCount`, `paidTotalInCents`, `ticketCount` (bilhetes pagos), `firstOrderAt`, `lastOrderAt`. `from`/`to` filtram o último pedido.
- `GET /api/v1/admin/customers/export` — mesmos filtros; CSV no mesmo formato da exportação de vendas.

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
  "customer": {
    "name": "Maria da Silva",
    "cpf": "52998224725",
    "phone": "84999855367",
    "beneficiaryName": "João Terceiro"
  }
}
```

`customer` é sempre o comprador: nome, CPF, telefone (obrigatório) e endereço formam o cadastro
em `pessoa`. `beneficiaryName` é opcional e só é enviado quando a compra é para outra pessoa;
ele não cria cadastro, apenas define o `nome` gravado no bilhete.

O formato anterior para um concurso continua aceito:

```json
{
  "raffleId": "2024029",
  "selection": { "mode": "manual", "cardIds": ["000123", "000456"] },
  "customer": {
    "name": "Maria da Silva",
    "cpf": "52998224725",
    "phone": "84999855367"
  }
}
```

Para surpresinha, `selection` deve ser `{ "mode": "random", "quantity": 3 }`, com
quantidade inteira entre 1 e 50. O backend ignora o preço do navegador, consulta o
concurso ativo, resolve o cliente novamente, atribui os bilhetes e recalcula o total. As
reservas de ambos os concursos são criadas em uma transação e resultam em um pedido e
um checkout. Cada item da resposta inclui `raffleId`, `raffleTitle` e `unitPriceInCents`.
A resposta pública inclui `items`, `selectionMode`, `unitPriceInCents`, `totalInCents`
e `expiresAt`; metadados internos de validação dos bilhetes não são expostos. Status
públicos: `pending`, `processing`, `paid`, `expired`, `cancelled` e `manual_review`.

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

- `POST /pessoa` com `nome`, `cpf` e `fone` — formato ainda precisa de validação live.
- `PUT /bilhete/validar` com `numero`, `concurso_id`, `lote_validacao`, `estabelecimento_id` e `posicao_lote` — campos obrigatórios confirmados por respostas de validação da API. O backend envia também `pessoas_id` (ID do comprador em `pessoa`) e `nome` (`beneficiaryName` quando a compra é para terceiro; senão o nome do comprador), campos opcionais segundo o swagger. Para cliente novo, o backend cadastra a pessoa após o pagamento e relê `GET /pessoa/cpf/{cpf}` para obter `pessoas_id`, pois a resposta de `POST /pessoa` não documenta o ID.
- `PUT /concurso/{id}` — usado pelo painel. O swagger não documenta o corpo; o backend lê `GET /concurso/atual`, troca só os campos `*_sorteiocap` ou `*_sorteioesp` do concurso editado (`data_inicio_*`, `data_fim_*` como `AAAA-MM-DD HH:MM:SS`, `data_*`, `hora_*`, `valor_bilhete_*` decimal, `qte_premios_*`, `premio_01..05_*` com `null` nos vazios, `qtd_giros_*`, `giros_*` (`"0"` sem giros) e `dupla_chance_*` 0/1), envia o registro inteiro e relê para confirmar. Formato ainda não validado contra a API real.
- `PUT /bilhete/reservado` e `GET /bilhete/reservado?concurso_id=&numero=&estabelecimento_id=` — **provisório, ainda não publicado**. Reserva com `reservado: true` e recebe `data_reservado` (token); libera com `reservado: false` e o `data_reservado` recebido. `409` indica bilhete já reservada/validada ou token que não é o dono. Contrato detalhado em [design-docs/2026-09-27-concorrencia-reserva-bilhete.md](design-docs/2026-09-27-concorrencia-reserva-bilhete.md).

## Limitações conhecidas

- O estabelecimento é fixo em `4734` para a regional `57`; a API de bilhetes recebe `estabelecimento_id`, não `id_regional`.
- Não havia concurso/bilhete ativo em 25/09/2026 para validar o formato dos itens.
- A reserva externa em `bilhete.reservado` está implementada no backend e desligada (`TICKET_RESERVATION_PROVIDER=none`) até a API de bilhetes publicar os endpoints. Não há venda atômica de várias bilhetes; o backend compensa reservas parciais.
- Uma falha após pagamento coloca o pedido em `manual_review`; operação precisa reconciliar entrega ou estorno.
