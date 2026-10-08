# Consulta de compras por CPF

## Objetivo e critérios de aceite

- Campo de CPF ao lado do carrinho no cabeçalho leva à página "Minhas compras".
- A página lista os pedidos feitos no site para o CPF com valor, método de pagamento, bilhetes e dezenas, status, data e comprovante.
- A tela de retorno do pagamento oferece link para "Minhas compras".
- `manual_review` nunca aparece como sucesso; pedido pendente oferece o link de pagamento enquanto não expira.

## Contexto consultado

- `docs/SECURITY.md`: CPF é dado pessoal; não logar, não guardar em `localStorage`.
- Pedidos ficam no SQLite (`orders.customer_json`); a API de bilhetes não expõe histórico por pessoa.

## Decisões

- `POST /api/v1/orders/lookup` com `{ "cpf": "..." }` no corpo: CPF fora da URL, logo fora de logs de acesso e do histórico do navegador.
- A resposta não devolve nome, telefone, endereço nem nome do terceiro; apenas dados do pedido.
- Limite em memória de 10 consultas por minuto por IP para dificultar varredura de CPFs.
- O CPF digitado no cabeçalho vai para a página por `history.state`, não por query string.
- Índice por `json_extract(customer_json, '$.cpf')` (migração 5) para não varrer a tabela.
- Descartado: consulta direto na API de bilhetes (sem endpoint de histórico) e exigir login.

## Etapas

1. Repositório, serviço, rota, presenter e limite de tentativas no backend, com testes.
2. Feature de consulta no frontend (schema, repositório, hook), página e rota.
3. Campo no cabeçalho e links na tela de pagamento.
4. Documentação de contrato e produto; `npm run check` e `npm run test:e2e`.

## Progresso

- 2026-09-28: plano criado.
- 2026-09-28: backend (migração 5, `POST /api/v1/orders/lookup`, limite por IP), feature `purchases`, página `/minhas-compras`, campo no cabeçalho e links na tela de pagamento concluídos.

## Validação

- `npx vitest run`: backend e frontend verdes, incluindo `server/http/purchase-lookup-routes.test.ts` e `src/pages/PurchasesPage.test.tsx`.
- `npm run test:e2e`: `tests/e2e/purchases.spec.ts` cobre retorno do pagamento até "Minhas compras" e o campo do cabeçalho (só desktop; no celular o campo é oculto e o botão abre a página).
- Seletores `getByLabel('CPF')` dos specs de compra passaram a usar `exact: true`, pois o cabeçalho tem outro campo de CPF.
- Pendências registradas no rastreador de dívida: autenticação só por CPF e limite em memória sem `trustProxy`.
