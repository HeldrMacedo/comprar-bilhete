# Prêmio principal no banner

## Objetivo e aceite

O banner da Home mostra o último prêmio preenchido de cada concurso. Quando não houver prêmio informado, mostra “Prêmios a confirmar”. A lista de prêmios permanece na ordem da API.

## Contexto e contratos

Consultados `docs/PRODUCT.md`, `ARCHITECTURE.md`, `docs/FRONTEND.md`, `docs/BACKEND.md`, `docs/API_CONTRACTS.md` e `docs/SECURITY.md`. `GET /concurso/atual` em 12/10/2026 omite alguns campos de prêmio e envia `premio_05_*: null`; o parser já transforma os campos 01 a 05 em `prizes` ordenados e sem vazios. `HomePage` recebe `prize` e `prizes` pela API normalizada.

## Etapas

- [x] Derivar `prize` do último item preenchido no parser e alinhar os dados mock.
- [x] Mostrar o último item de `prizes` no banner, com fallback para `prize`.
- [x] Cobrir o comportamento com testes e executar `npm run check` e `npm run test:e2e`.

## Decisões

Usar a lista normalizada evita duplicar regras de limpeza de `null` e espaços. O texto genérico existente serve de fallback quando a origem não informa prêmios.

## Progresso e validação

- 12/10/2026: causa identificada no mapeamento de `prize` para o primeiro campo da API.
- 12/10/2026: parser, banner, mocks, testes e contratos atualizados. `npm run check` parou em formatação pré-existente de `server/domains/payments/infinitepay-gateway.ts` e `src/app/styles.css`. Lint, validação de arquitetura, validação de documentação e build passaram. Testes do parser e da Home passaram; a suíte completa teve 221 testes aprovados e um teste de InfinitePay falhou por diferença no `webhook_url`. `npm run test:e2e`: 31 aprovados, um ignorado.
