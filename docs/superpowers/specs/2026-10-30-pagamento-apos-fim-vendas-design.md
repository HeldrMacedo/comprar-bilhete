# Pagamento recebido após o fim das vendas do concurso

## Objetivo

O código Pix da InfinitePay vale por 72 horas e o prazo não pode ser reduzido. Sem uma regra
no backend, o cliente pode gerar o Pix antes do sorteio, assistir ao sorteio e só pagar se o
bilhete for premiado. A partir desta mudança, bilhete cujo pagamento chegou ao servidor no fim
das vendas do concurso (`data_fim_sorteiocap` ou `data_fim_sorteioesp`) ou depois dele não é
validado: fica `not_validated` no bilhete, no pedido, em "Minhas compras" e no painel, e o
valor dele é estornado fora do sistema. A comparação usa sempre o relógio do servidor.

## Decisões

| Tema                       | Decisão                                                                                                                                 | Alternativas descartadas                                       |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| Granularidade              | Por bilhete. Em pedido CAP + ESP, valida os bilhetes do concurso ainda aberto e marca os do concurso encerrado                          | Pedido inteiro não validado se qualquer concurso encerrou      |
| Hora do pagamento          | Hora do servidor ao **receber** a primeira evidência confirmada (webhook gravado ou retorno do redirect), não a hora do processamento   | Hora em que `payment_check` confirmou                          |
| Ação do admin              | Nenhuma validação forçada. O painel mostra o valor a estornar; o estorno é feito fora do sistema                                        | Forçar validação com justificativa auditada                    |
| Baixa manual após o prazo  | Mesma regra, com a hora do servidor no clique de aprovação                                                                              | Liberar baixa manual sem checar prazo                          |
| Pedido parcial             | Status `paid`, com os bilhetes atrasados marcados `not_validated`                                                                       | Novo status de pedido "parcial"                                |
| Pedido sem nenhum validado | Novo status `not_validated`                                                                                                             | `manual_review` (hoje é o destino de pagamento após expiração) |
| Prazo no navegador         | O front só exibe `salesEndAt` vindo do servidor e o status devolvido pelo backend; nunca decide "encerrado" pelo relógio do dispositivo | Contagem regressiva no cliente decidindo bloqueio              |

## Dados

- `ticketSchema` (`server/domains/orders/order-types.ts`) ganha:
  - `salesEndAt` (ISO, opcional): fim das vendas do concurso, copiado na criação do pedido junto
    com `drawDate` em `withRaffleDetails`.
  - `validationStatus` (opcional, só `'not_validated'`): ausente significa fluxo normal.
- `orderStatusSchema` ganha `not_validated`.
- Migração v10 adiciona `orders.payment_received_at TEXT` (nulo até haver pagamento confirmado).
- Bilhete gravado antes da mudança, sem `salesEndAt`, usa `drawDate` como limite; sem nenhum
  dos dois, não há checagem (comportamento atual).

## Hora do pagamento

`payment_check` da InfinitePay não devolve a data do pagamento, então a referência é sempre o
relógio do servidor:

- Webhook: `payment_events.created_at` da linha com o **mesmo** `transaction_nsu` e
  `invoice_slug` que `payment_check` confirmou. Um webhook com NSU inventado nunca é confirmado
  e, por isso, não antecipa o horário.
- Redirect (`reconcileRedirect`): hora do servidor ao receber o retorno. Se já existir webhook
  do mesmo NSU, vale o menor dos dois.
- Baixa manual no painel: hora do servidor no momento da aprovação.
- O valor é gravado uma única vez em `payment_received_at`; reprocessamentos reutilizam o
  gravado.

## Regra

Bilhete atrasado: `payment_received_at >= salesEndAt` do bilhete.

Em `OrderService.reconcile`, depois de `payment_check` confirmar e de o valor bater:

1. Grava `payment_received_at` (se ainda vazio) e separa os bilhetes atrasados.
2. Todos atrasados: pedido vira `not_validated`, bilhetes marcados, reservas local e externa
   liberadas, nenhum e-mail enfileirado. Vale também para pedido já `expired` ou `cancelled`,
   que hoje iria para `manual_review`.
3. Parte atrasada: os atrasados são marcados e têm as reservas liberadas; os demais seguem o
   fluxo atual (posição de lote, `fulfillOrder`, `paid`). O e-mail e o PDF levam só os bilhetes
   validados.
4. Nenhum atrasado: fluxo atual, sem mudança.

Pedido expirado ou cancelado pago **dentro** do prazo continua em `manual_review`, como hoje.

Outros pontos de entrada:

- `approvePending` (baixa manual): aplica a mesma regra com a hora do clique.
- `retryManualReview`: aplica a regra com o `payment_received_at` gravado; bilhetes atrasados
  são marcados e não são validados. Se todos estiverem atrasados, o pedido vira
  `not_validated`. Pedido em análise anterior à migração, sem `payment_received_at`, usa o
  `created_at` mais antigo de `payment_events` do pedido; sem evento (baixa manual antiga), não
  há checagem.
- `cancelByAdmin` não muda.

Brecha adicional corrigida: pedido de concurso único passa a limitar `expiresAt` ao
`salesEndAt` do concurso, como o pedido agrupado já faz.

## API

- Concursos públicos expõem `salesEndAt` (ISO).
- Item de pedido expõe `validationStatus` quando `not_validated`.
- Pedido expõe `refundDueInCents` (soma de `unitPriceInCents` dos bilhetes não validados)
  quando maior que zero.
- `message` do presenter para `not_validated`: pagamento recebido após o fim das vendas; bilhetes
  não validados; valor será estornado.
- Em "Minhas compras", dados do comprovante (`identification`, lote, prêmios, titular) saem só
  para itens validados de pedido `paid`. Pedido `not_validated` não traz dados pessoais.
- Painel: filtro e rótulo para `not_validated`, selo por bilhete, `refundDueInCents` na lista e
  no detalhe. Receita e bilhetes pagos do dashboard excluem bilhetes não validados; o dashboard
  passa a mostrar total a estornar.

## Telas

Texto do aviso, com data e hora do servidor formatadas em `America/Fortaleza`:

> Pague até {data e hora do fim das vendas} (horário de Fortaleza). O código Pix vale por 72
> horas, mas pagamento recebido depois do fim das vendas do concurso não valida o bilhete: ele
> fica como não validado e o valor é estornado.

- `HomePage` (escolha de bilhetes): aviso curto com o prazo de cada concurso exibido.
- `CartPage` (carrinho/checkout): aviso completo por concurso, próximo ao botão de pagar.
- `PaymentPage`: estado `not_validated` com a mensagem do backend; em pedido parcial, lista
  quais bilhetes foram validados e quais não.
- `PurchasesPage` ("Minhas compras"): selo "Não validado" no pedido e em cada bilhete afetado;
  comprovante e compartilhamento só para bilhetes validados; aviso de prazo em pedido `pending`.
- Admin (`AdminSalesPage`, `AdminHomePage`, `StatusBadge`, filtros e rótulos): novo status, selo
  por bilhete e valor a estornar.

## Testes

- `order-service.test.ts`: pagamento antes, exatamente no prazo e depois; pedido CAP + ESP
  parcial; pedido expirado pago após o prazo vira `not_validated` (não `manual_review`); webhook
  com NSU diferente não antecipa o horário; redirect e webhook usam o menor horário; baixa
  manual após o prazo; reprocessamento de `manual_review` com bilhete atrasado; pedido de
  concurso único com `expiresAt` limitado ao fim das vendas.
- `database.test.ts`: migração v10.
- Presenter: dados pessoais só em itens validados; `refundDueInCents`.
- Repositório do painel: receita e contagens sem bilhetes não validados.
- UI: `HomePage.test`, `CartPage.test` e `PurchasesPage.test` com aviso e selo.
- E2E: jornada com pagamento mock recebido após o fim das vendas.

## Documentação

Atualizar `docs/API_CONTRACTS.md` (status, campos e regra), `ARCHITECTURE.md` e `CLAUDE.md`
(estados do pedido), e criar o plano em `docs/exec-plans/active/`.

## Fora do escopo

- Estorno automático pela InfinitePay.
- Expirar o link de checkout da InfinitePay antes das 72 horas.
