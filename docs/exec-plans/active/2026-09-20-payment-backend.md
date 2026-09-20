# Backend próprio e InfinitePay

Status: em andamento.

## Objetivo

Adicionar ao mesmo repositório um backend Node.js que seja a única fronteira do React para pedidos e pagamento. O backend consulta a API de bilhetes, persiste/reserva pedidos, cria checkout InfinitePay, recebe webhook, reconcilia o pagamento e só depois valida as cartelas na API externa.

## Critérios de aceite

- Frontend não chama a API de bilhetes nem a InfinitePay diretamente.
- Pedido e itens ficam persistidos em SQLite, com preço calculado pelo backend.
- Cartelas são reservadas localmente com unicidade e expiração.
- Link InfinitePay usa `order_nsu`, valores em centavos, redirect e webhook configurados no servidor.
- Webhook é persistido rapidamente e processado de forma idempotente.
- Pagamento é conferido em `/payment_check`, inclusive valor e pedido.
- Venda externa ocorre somente após pagamento confirmado.
- Falha na entrega vira revisão manual, sem mostrar cartelas como garantidas.
- Mocks permitem testes sem pagamento ou venda real.

## Contratos consultados

- InfinitePay `POST /links` → `{ url }`.
- InfinitePay `POST /payment_check` → `{ success, paid, amount, ... }`.
- Webhook contém `invoice_slug`, `amount`, `transaction_nsu`, `order_nsu` e recibo.
- API de bilhetes: concurso, disponíveis, pessoa e `PUT /bilhete/validar`.
- Sondagem segura confirmou que a venda exige `numero`, `concurso_id`, `lote_validacao`, `estabelecimento_id` e `posicao_lote`.

## Etapas

- [x] Criar servidor Fastify, configuração e SQLite.
- [x] Criar gateways mock/live para bilhetes e InfinitePay.
- [x] Criar pedidos, reservas, checkout, webhook e reconciliação.
- [x] Ligar o frontend ao backend próprio.
- [x] Cobrir regras críticas com testes.
- [x] Atualizar documentação e CI.
- [x] Executar check e E2E full-stack.
- [ ] Validar providers live com `estabelecimento_id`, concurso ativo e InfiniteTag reais.

## Validação

`npm run check` aprovado com lint, formato, arquitetura, documentação, testes e build. `npm run test:e2e` aprovado usando frontend e backend próprios em Chromium desktop e perfil móvel. Nenhum serviço externo foi chamado nos testes.
