# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Leia [AGENTS.md](AGENTS.md) primeiro: ele é o índice do repositório e define as invariantes obrigatórias (TypeScript estrito sem `any`, Zod na fronteira, dinheiro em centavos inteiros, pagamento confirmado só pelo backend, nada sensível em `VITE_*`). Documentação e textos de usuário ficam em português brasileiro.

## Comandos

```bash
cp .env.example .env && npm install
npm run dev:full          # backend Fastify (3333) + Vite (5173, proxy /api)
npm run dev               # só frontend
npm run dev:server        # só backend (tsx watch)
npm test                  # Vitest: src/**/*.test.{ts,tsx} e server/**/*.test.ts
npx vitest run caminho/do/arquivo.test.ts      # um arquivo
npx vitest run -t "nome do teste"              # um teste
npm run test:e2e          # Playwright (chromium + mobile Pixel 7)
npx playwright test tests/e2e/arquivo.spec.ts --project=chromium
npm run check             # lint + prettier + validate:architecture + validate:docs + test + build
```

`npm run check` é obrigatório antes de concluir; mudanças de jornada exigem também `npm run test:e2e`. O E2E sobe seu próprio backend na porta 3334 com `DATABASE_PATH=:memory:` e providers mock, e o Vite na porta 4173.

## Arquitetura

Full-stack no mesmo repositório: React (`src/`) conversa apenas com o backend Fastify (`server/`), que persiste em SQLite nativo do Node e encapsula a API externa de bilhetes e a InfinitePay. O backend é a autoridade sobre preço, disponibilidade, reserva, pedido e pagamento; o carrinho no navegador é só intenção. Detalhes em [ARCHITECTURE.md](ARCHITECTURE.md).

**Frontend**: features em `src/features/{raffle,cart,checkout}` seguem camadas `domain → api → repository → service → runtime → ui`; cada camada importa apenas as da esquerda. Features não importam `pages/` nem `app/`; páginas compõem features e nunca fazem HTTP. O repository é a única camada que chama `requestJson`. `scripts/validate-architecture.mjs` impõe essas regras no `check`.

**Backend**: `server/domains/{orders,payments,tickets}` usam porta + providers (mock/live), selecionados por `TICKET_PROVIDER` e `PAYMENT_PROVIDER`. `server/config/env.ts` valida o ambiente; `server/http/` tem rotas e presenters; `server/shared/` tem banco, migrações, `fetch-json` e erros.

**Estados do pedido**: `pending → processing → paid`, ou `expired`/`cancelled`. `manual_review` significa dinheiro recebido com entrega pendente de intervenção e nunca deve aparecer como sucesso. Contratos e estados em [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md).

## Modos e ambiente

- `VITE_API_MODE=mock` roda o frontend sem backend; `live` usa só `/api`. Falha no live nunca pode cair silenciosamente para mock.
- Compras em modo live exigem `TICKET_API_BASE_URL` HTTPS (envia dados pessoais). Com HTTP, apenas concursos e cartelas são consultados e a compra fica indisponível.
- Webhook InfinitePay: `PUBLIC_API_URL/api/v1/webhooks/infinitepay` (URL pública HTTPS, sem barra final).
- Após alterar `.env`/`.env.local`, reinicie Vite e backend.

## Registro de conhecimento

Trabalho com várias etapas ganha plano em `docs/exec-plans/active/` (modelo em [docs/PLANS.md](docs/PLANS.md)). Decisões duráveis vão em `docs/design-docs/`; dívida técnica em `docs/exec-plans/tech-debt-tracker.md`. `validate:docs` falha se links `.md` em README/AGENTS/ARCHITECTURE quebrarem.
