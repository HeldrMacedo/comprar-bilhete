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
2. Persiste pedido e reservas com unicidade no SQLite.
3. Gera link InfinitePay com `order_nsu`, redirect e webhook próprios.
4. Webhook é validado contra pedido/valor, persistido e respondido rapidamente.
5. Worker chama `payment_check`; somente uma resposta paga e com valor exato avança.
6. Backend cadastra/consulta pessoa e valida cada cartela na API externa.
7. Pedido vira `paid` somente após todas as cartelas serem entregues.

O redirect também pode iniciar reconciliação com `transaction_nsu` e `slug`; ele nunca confirma pagamento sozinho.

## Providers

`TICKET_PROVIDER=mock` e `PAYMENT_PROVIDER=mock` são o padrão seguro de desenvolvimento. Para live, configure `TICKET_ESTABLISHMENT_ID`, `INFINITEPAY_HANDLE`, URLs públicas HTTPS e armazenamento persistente para `DATABASE_PATH`.

## Limitação da API externa

A reserva é forte dentro deste canal, mas a API externa não publica uma operação de reserva. Outro canal pode vender a mesma cartela entre seleção e pagamento. Nesse caso o pedido pago entra em revisão manual. Para eliminar o risco, a API externa precisa oferecer reserva com expiração ou venda atômica de lote.
