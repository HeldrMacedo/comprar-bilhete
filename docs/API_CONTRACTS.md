# Contratos de API

## Backend próprio

O React usa apenas `/api`, encaminhado pelo Vite ao Fastify local.

- `GET /api/health` — saúde do servidor.
- `GET /api/v1/raffles/active` — concurso normalizado, sem cartelas.
- `GET /api/v1/raffles/{id}/cards` — cartelas disponíveis normalizadas.
- `POST /api/v1/orders` — cria pedido e reserva localmente as cartelas.
- `POST /api/v1/orders/{id}/checkout` — cria ou reutiliza o link InfinitePay.
- `GET /api/v1/orders/{id}` — consulta status seguro do pedido.
- `GET /api/v1/orders/{id}?transaction_nsu=&slug=` — reconcilia o redirect na InfinitePay.
- `POST /api/v1/webhooks/infinitepay` — persiste notificação e agenda reconciliação.

Entrada de pedido:

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
concurso ativo, resolve o cliente novamente, atribui as cartelas e recalcula o total.
A resposta pública inclui `items`, `selectionMode`, `unitPriceInCents`, `totalInCents`
e `expiresAt`; metadados internos de validação das cartelas não são expostos. Status
públicos: `pending`, `processing`, `paid`, `expired`, `cancelled` e `manual_review`.

## InfinitePay

### Criar checkout

`POST https://api.checkout.infinitepay.io/links` com `handle`, `order_nsu`, `redirect_url`, `webhook_url`, cliente e itens em centavos. Resposta validada: `{ "url": "https://checkout.infinitepay.com.br/..." }`.

### Confirmar pagamento

`POST https://api.checkout.infinitepay.io/payment_check` com `handle`, `order_nsu`, `transaction_nsu` e `slug`. O backend exige `success=true`, `paid=true` e `amount` exatamente igual ao total persistido.

### Webhook

Recebe `invoice_slug`, `amount`, `paid_amount`, `capture_method`, `transaction_nsu`, `order_nsu`, `receipt_url` e itens. O evento não libera cartelas sozinho; ele é persistido e reconciliado em `payment_check`.

## API externa de bilhetes

Auditada em 20/09/2026 contra `http://66.94.99.64:9090/swagger/doc/json`. A API estava online na versão 1.0.0, mas `/concurso/atual` respondeu `404`.

### Leitura

- `GET /concurso/atual` e `GET /concurso/{id}`.
- `GET /bilhete/disponiveis?concurso_id=&estabelecimento_id=&pagina=`.
- `GET /pessoa/cpf/{cpf}`.

O valor do bilhete chega em reais e é convertido para centavos. O provider live espera nos itens de bilhete `numero`, `lote_validacao`, `posicao_lote` e `numeros`; esse formato ainda precisa ser confirmado com um concurso ativo.

### Escrita

- `POST /pessoa` com `nome`, `cpf` e `fone` — formato ainda precisa de validação live.
- `PUT /bilhete/validar` com `numero`, `concurso_id`, `lote_validacao`, `estabelecimento_id` e `posicao_lote` — campos obrigatórios confirmados por respostas de validação da API.

## Limitações conhecidas

- Falta `TICKET_ESTABLISHMENT_ID` real.
- Não havia concurso/cartela ativa para validar o formato dos itens.
- A API externa não oferece reserva com expiração nem venda atômica de várias cartelas.
- Uma falha após pagamento coloca o pedido em `manual_review`; operação precisa reconciliar entrega ou estorno.
