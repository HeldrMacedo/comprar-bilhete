# Confiabilidade

## Estados críticos

- Backend indisponível: mostrar erro recuperável, nunca trocar para mock automaticamente.
- Cartela reservada por outra pessoa: backend retorna `409`; atualizar disponibilidade antes de nova tentativa.
- Checkout criado e navegação interrompida: pedido pendente pode ser retomado por ID.
- Retorno sem pagamento: manter `pending`; não assumir sucesso.
- Webhook duplicado: backend processa com idempotência.
- Webhook recebido: persistir antes de responder e processar pela fila local; falha permanece para nova tentativa.
- Pagamento confirmado e venda externa falha: marcar `manual_review`, manter evidência e tentar reconciliação controlada.
- Polling: 2,5 s somente enquanto pendente e com backoff/limite a ser definido após contrato live.

## Metas iniciais

- LCP móvel menor que 2,5 s em conexão 4G.
- Resposta visual a ações menor que 100 ms.
- Nenhum erro de JavaScript nas jornadas críticas.
- Todas as falhas externas produzem mensagem e opção segura de recuperação.

## Observabilidade necessária no backend

Correlacionar `order_nsu`, pedido, cartelas, link e transação sem registrar CPF/telefone. Medir criação de pedido, criação de checkout, abandono, tempo até pagamento, eventos pendentes e pedidos em revisão manual. Pagamento tardio, sem reserva ativa, permanece em `manual_review` com evidência transacional preservada.
