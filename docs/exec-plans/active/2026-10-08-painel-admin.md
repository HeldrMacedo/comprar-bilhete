# Painel administrativo

Especificação: [../../superpowers/specs/2026-10-08-painel-admin-design.md](../../superpowers/specs/2026-10-08-painel-admin-design.md)

## Objetivo e critérios de aceite

- `/admin` só abre com sessão válida; login por usuário e senha; um único papel (administrador).
- Dashboard, Sorteios, Vendas, Clientes, Configurações e Usuários conforme a especificação.
- Responsivo (360 px e desktop), teclado, estados de carregamento, vazio e erro.

## Contexto consultado

- Swagger da API de bilhetes (`/swagger/doc/json`, 08/10/2026): `PUT /concurso/{id}` com corpo não documentado; `GET /concurso/atual` devolve um registro com os dois sorteios (`*_sorteiocap`, `*_sorteioesp`). Rotas de escrita de concurso aparecem sem `security`.
- Não há listagem de pessoas nem CRUD de usuários na API.

## Etapas

### Fase 1: base, autenticação e usuários

- [x] Migração v7 com `admin_users`, `admin_sessions`, `admin_audit_log`, `site_settings`.
- [x] `password.ts`, repositórios, `AdminAuthService`, `AdminUserService` com testes.
- [x] Env `ADMIN_BOOTSTRAP_LOGIN`/`ADMIN_BOOTSTRAP_PASSWORD`; bootstrap no `buildApp`.
- [x] `@fastify/cookie`; rotas de sessão e usuários com `preHandler`; testes de rota.
- [x] Frontend: feature `admin`, `RequireAdmin`, `AdminLayout`, login, usuários, componentes base.
- [x] E2E de login, proteção e logout.

### Fase 2: vendas e clientes

- [x] Consulta paginada de pedidos com busca e filtros; CSV.
- [x] Extrair `fulfill(order)` no `OrderService`; aprovar e cancelar com auditoria.
- [x] Clientes agrupados por CPF; CSV.
- [x] Telas e E2E.

### Fase 3: dashboard

- [x] Indicadores, próximos sorteios, séries; gráficos SVG; tela e testes.

### Fase 4: sorteios e configurações

- [x] `updateContest` (live: GET + mescla + PUT; mock em memória) e tela com confirmação para preço/datas.
- [x] `site_settings` com YouTube; rota pública; seção na Home com carregamento sob demanda.
- [ ] Validar formato do `PUT /concurso/{id}` com a API real, com autorização do responsável.

## Progresso

- 08/10/2026: especificação aprovada; fase 1 iniciada.
- 08/10/2026: fase 1 concluída. `requestJson` passou a enviar `Content-Type` só com corpo (Fastify recusava `DELETE` sem corpo) e a aceitar `204`. `setErrorHandler` movido para antes do registro de plugins, senão escopos encapsulados usavam o handler padrão.
- 08/10/2026: fase 2 concluída. `OrderService.fulfill` concentra a entrega (webhook e painel). Reprocessar `manual_review` exige bilhete ainda disponível na API, porque `PUT /bilhete/validar` não é condicional; pedido com parte dos bilhetes já validada fica bloqueado e precisa de conferência manual na API. `assignBatchPositions` preserva posições já atribuídas. Consultas do painel ficam em `AdminSalesRepository`, que lê a tabela `orders` com `mapOrder` exportado do repositório de pedidos.
- 08/10/2026: fase 3 concluída. "Próximos sorteios" usa os concursos ativos do gateway, como a Home. O limite de login passou a contar só falhas (o E2E com vários logins estourava o limite anterior, que contava também os acertos). Gráfico diário em SVG com tabela oculta para leitor de tela; barras horizontais em HTML.
- 08/10/2026: `webhook_url` voltou a usar `PUBLIC_API_URL` (o túnel de desenvolvimento já vem do `.env.local`). Layout do painel com altura da janela: topo e menu fixos, só `.admin-main` rola; `.admin-page` ocupa a largura toda. O botão de menu deixou de aparecer no desktop.
- 08/10/2026: fase 4 concluída, exceto a validação do `PUT /concurso/{id}` na API real (aguarda autorização). Porta `ContestAdminGateway` separada do `TicketGateway`; no modo mock o próprio `MockTicketGateway` é editável por instância, então a Home reflete a edição. O live relê o registro após o `PUT` e falha com `UPSTREAM_NOT_APPLIED` se a API não aplicou. Edições simultâneas dos dois concursos por admins diferentes podem se sobrescrever (GET + PUT do registro inteiro); risco aceito pelo volume de uso.

## Validação

- Fase 1 (08/10/2026): `npm run check` passa, exceto `infinitepay-gateway.test.ts` > "usa a origem publica configurada para o webhook", que já falhava antes (URL de túnel fixa no gateway, registrada no rastreador de dívida). `tests/e2e/admin.spec.ts` passa em chromium e mobile.
- Fase 2 (08/10/2026): `npm run check` passa, com a mesma exceção do gateway InfinitePay. E2E completo passou duas vezes seguidas (23 passaram, 1 pulado). Numa execução anterior, `purchase.spec.ts` > "cliente novo informa endereço na surpresinha" (mobile) falhou uma vez com o formulário de cliente vazio; não se repetiu. Os testes do painel usam CPF e bilhetes próprios (`98765432100`, `card-040` a `card-047`) para não interferir nas outras jornadas, que dividem o mesmo backend.
- Fase 3 (08/10/2026): `npm run check` com a mesma exceção do gateway InfinitePay (201 testes passam); build ok; E2E completo: 25 passaram, 1 pulado. Dashboard conferido por screenshot em desktop e mobile.
- Ajustes pós-fase 3 (08/10/2026): `npm run check` passa inteiro (202 testes); E2E 25 passaram, 1 pulado.
- Fase 4 (08/10/2026): `npm run check` passa inteiro (221 testes); E2E completo passou duas vezes seguidas (31 passaram, 1 pulado). Os testes do painel escolhem bilhetes livres pela API e usam datas futuras, porque o backend do E2E é compartilhado entre as jornadas. Pendente: validar `PUT /concurso/{id}` na API real.
