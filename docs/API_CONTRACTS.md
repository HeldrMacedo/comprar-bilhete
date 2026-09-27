# Contratos de API

## Backend próprio

O React usa apenas `/api`, encaminhado pelo Vite ao Fastify local.

- `GET /api/health` — saúde do servidor.
- `GET /api/v1/raffles/active` — lista de concursos ativos normalizados, sem cartelas; `[]` quando ambos os blocos são ausentes ou expirados. Cada concurso inclui `purchaseEnabled`; é `false` quando a origem live usa HTTP sem `TICKET_API_ALLOW_HTTP=true`.
- `GET /api/v1/raffles/{id}/cards` — cartelas disponíveis normalizadas.
- `POST /api/v1/orders` — cria pedido e reserva localmente as cartelas.
- `POST /api/v1/orders/{id}/checkout` — cria ou reutiliza o link InfinitePay.
- `GET /api/v1/orders/{id}` — consulta status seguro do pedido.
- `GET /api/v1/orders/{id}?transaction_nsu=&slug=` — reconcilia o redirect na InfinitePay.
- `POST /api/v1/webhooks/infinitepay` — persiste notificação e agenda reconciliação.

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
    "phone": "84999855367"
  }
}
```

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
concurso ativo, resolve o cliente novamente, atribui as cartelas e recalcula o total. As
reservas de ambos os concursos são criadas em uma transação e resultam em um pedido e
um checkout. Cada item da resposta inclui `raffleId`, `raffleTitle` e `unitPriceInCents`.
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

Auditada em 20/09/2026 contra `http://66.94.99.64:9090/swagger/doc/json`. Em uma consulta de 25/09/2026, `/concurso/atual` respondeu `404` com `{"error":"Nenhum concurso ativo encontrado"}`. Em nova consulta no mesmo dia, a rota voltou a responder com uma lista contendo um objeto com os blocos `sorteiocap` e `sorteioesp`. O parser também aceita esse objeto diretamente. Cada bloco possui ID, data, hora, prazo e preço próprios. ID terminado em `000` (por exemplo, `2026000`) representa ausência de sorteio nesse bloco e não pode ser exibido nem vendido.

Na amostra da nova resposta, CAP tinha ID `2026041` com sorteio em 27/09/2026 (domingo), enquanto ESP tinha ID `2026040` com sorteio em 23/09/2026 (quarta) e `data_fim_sorteioesp` já passada. O dia exibido é derivado de `data_sorteio*`, sem associar CAP/ESP a um dia fixo. Um concurso deixa de ser oferecido quando sua `data_fim_*`, incluindo o horário em `America/Fortaleza`, é atingida. A listagem de bilhetes disponíveis para ambos os IDs retornou `count: 0` no estabelecimento `4734`.

A origem atualmente informada usa HTTP e não respondeu via HTTPS em 25/09/2026. O backend permite ler concursos e cartelas públicas nesse endereço, mas bloqueia consulta de CPF/telefone, criação de pedido e validação de bilhetes. Com `TICKET_API_ALLOW_HTTP=true`, o backend libera essas operações pela origem HTTP e registra um aviso no startup; CPF e telefone trafegam sem TLS entre o backend e a API de bilhetes. O padrão continua `false`.

### Leitura

- `GET /concurso/atual` e `GET /concurso/{id}`.
- `GET /bilhete/disponiveis?concurso_id=&estabelecimento_id=&pagina=`.
- `GET /pessoa/cpf/{cpf}`.

Os campos `reservado`, `data_reservado` e `validado` são opcionais na listagem e na consulta por número. Quando presentes, cartelas validadas ou com reserva dentro de `TICKET_RESERVATION_TTL_MINUTES` não são oferecidas.

O valor do bilhete chega em reais e é convertido para centavos. Em 25/09/2026, com o concurso 2026041 ativo, `/bilhete/disponiveis` devolveu itens com `numero`, `lote_validacao: ""`, `posicao_lote: 0` e as dezenas em `dezenas` como texto separado por `|` (por exemplo, `"3|6|16"`), além de `dezenas2`, `numero2` e `identificacao`. O provider aceita `posicao_lote` zero e lê as dezenas de `numeros` (array) ou de `dezenas`. `dezenas2` (dupla chance) ainda não é exibido. `/bilhete/disponivel/numero` devolve o item em `bilhete` (não em `data`), com `encontrado` e `disponivel`; `disponivel: false` é tratado como indisponível, e bilhete não distribuído responde `404`.

### Escrita

- `POST /pessoa` com `nome`, `cpf` e `fone` — formato ainda precisa de validação live.
- `PUT /bilhete/validar` com `numero`, `concurso_id`, `lote_validacao`, `estabelecimento_id` e `posicao_lote` — campos obrigatórios confirmados por respostas de validação da API.
- `PUT /bilhete/reservado` e `GET /bilhete/reservado?concurso_id=&numero=&estabelecimento_id=` — **provisório, ainda não publicado**. Reserva com `reservado: true` e recebe `data_reservado` (token); libera com `reservado: false` e o `data_reservado` recebido. `409` indica cartela já reservada/validada ou token que não é o dono. Contrato detalhado em [design-docs/2026-09-27-concorrencia-reserva-bilhete.md](design-docs/2026-09-27-concorrencia-reserva-bilhete.md).

## Limitações conhecidas

- O estabelecimento é fixo em `4734` para a regional `57`; a API de bilhetes recebe `estabelecimento_id`, não `id_regional`.
- Não havia concurso/cartela ativa em 25/09/2026 para validar o formato dos itens.
- A reserva externa em `bilhete.reservado` está implementada no backend e desligada (`TICKET_RESERVATION_PROVIDER=none`) até a API de bilhetes publicar os endpoints. Não há venda atômica de várias cartelas; o backend compensa reservas parciais.
- Uma falha após pagamento coloca o pedido em `manual_review`; operação precisa reconciliar entrega ou estorno.
