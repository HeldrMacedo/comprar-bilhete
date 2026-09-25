# Leitura de concursos via HTTP sem liberar operações pessoais

## Objetivo

Permitir que `npm run dev:full` inicie com `TICKET_PROVIDER=live` e a origem HTTP disponível, para mostrar concursos e cartelas. Impedir consultas de cliente e compras que enviariam dados pessoais ou validariam vendas sem TLS. Quando houver origem HTTPS, manter a jornada de compra habilitada.

## Contexto

- `GET /concurso/atual` respondeu pela origem HTTP em 25/09/2026 como lista com um objeto; CAP `2026041` e ESP `2026040`.
- `.env.local` contém `TICKET_PROVIDER=live` e URL HTTP. `server/config/env.ts` rejeita a configuração antes de iniciar Fastify, causando o `ECONNREFUSED` no proxy Vite.
- `docs/SECURITY.md` exige TLS para CPF e telefone. O backend consulta `/pessoa/*` ao buscar cliente ou criar pedido.

## Etapas

1. Testar e permitir a configuração HTTP para leitura em modo live.
2. Bloquear consultas de cliente, criação de pedido e entrega live sem HTTPS, antes de qualquer chamada externa sensível.
3. Indicar no contrato dos sorteios que a compra está indisponível e desabilitar a ação na Home.
4. Atualizar documentação e executar `npm run check` e `npm run test:e2e`.

## Verificação

- Backend iniciado com o `.env.local` real na porta temporária 3335: `GET /api/v1/raffles/active` respondeu 200 com CAP `2026041` e `purchaseEnabled: false`; `GET /api/v1/raffles/2026041/cards` respondeu 200 com `[]`.
- `npm test` com `NODE_OPTIONS=--no-webstorage`: 80 testes passaram.
- `npm run test:e2e` fora do sandbox: 10 testes passaram em desktop e mobile.
- `npm run build`, `npm run lint`, `npm run validate:architecture` e `npm run validate:docs` passaram.
- `npm run check` foi executado e parou no Prettier global por arquivos preexistentes fora do escopo, incluindo `.kilo/worktrees/`. Os arquivos alterados nesta etapa passaram na verificação direcionada de Prettier.
