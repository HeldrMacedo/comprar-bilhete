# Backend

## Stack e execução

Fastify, TypeScript, Zod e SQLite nativo do Node. Execute frontend e servidor com `npm run dev:full`. O servidor escuta a porta 3333 por padrão e o Vite encaminha `/api`.

## Estados do pedido

- `pending`: cartelas reservadas localmente, aguardando pagamento.
- `processing`: pagamento confirmado; cartelas sendo validadas externamente.
- `paid`: pagamento e todas as cartelas confirmados.
- `expired` ou `cancelled`: compra não concluída.
- `manual_review`: dinheiro recebido, mas a entrega precisa de intervenção; nunca apresentar como sucesso.

## Fluxo de pagamento

1. O backend busca concurso/preço e confirma disponibilidade.
2. Persiste pedido e reservas com unicidade no SQLite e trava cada cartela na API de bilhetes (`reservado`), desfazendo tudo em conflito.
3. Gera link InfinitePay com `order_nsu`, redirect e webhook próprios.
4. Webhook é validado contra pedido/valor, persistido e respondido rapidamente.
5. Worker chama `payment_check`; somente uma resposta paga e com valor exato avança.
6. Backend confere que a trava externa ainda pertence ao pedido; depois cadastra/consulta pessoa e valida cada cartela (`validado`) na API externa.
7. Pedido vira `paid` somente após todas as cartelas serem entregues.

O redirect também pode iniciar reconciliação com `transaction_nsu` e `slug`; ele nunca confirma pagamento sozinho.

## Providers

`TICKET_PROVIDER=mock` e `PAYMENT_PROVIDER=mock` são o padrão seguro de desenvolvimento. Para live, configure `TICKET_ESTABLISHMENT_ID`, `INFINITEPAY_HANDLE`, URLs públicas HTTPS e armazenamento persistente para `DATABASE_PATH`. O filtro externo usa estabelecimento `4734` para a regional `57`; a API externa não recebe parâmetro de regional. Webhooks são duráveis e idempotentes, mas exigem `payment_check` antes de liberar `paid`. Pix deve estar habilitado nas configurações do checkout InfinitePay; o payload `/links` não força método de pagamento.

## Limitação da API externa

A reserva local é forte dentro deste canal. A trava externa em `bilhete.reservado` (`TICKET_RESERVATION_PROVIDER`) fica em `none` enquanto a API de bilhetes não publicar os endpoints; nesse modo, outro canal pode vender a mesma cartela entre seleção e pagamento, e o pedido pago entra em revisão manual. Com `live`, a atualização condicional em `reservado` impede a venda por outro canal dentro de `TICKET_RESERVATION_TTL_MINUTES`; o worker libera travas de pedidos expirados ou cancelados. Detalhes em [design-docs/2026-09-27-concorrencia-reserva-bilhete.md](design-docs/2026-09-27-concorrencia-reserva-bilhete.md).
