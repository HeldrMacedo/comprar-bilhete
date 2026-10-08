# Painel administrativo (`/admin`)

## Objetivo

Dar a administradores um painel autenticado para acompanhar vendas, agir sobre pedidos, consultar clientes, editar os sorteios na API de bilhetes, configurar o vídeo do YouTube da Home e gerenciar quem acessa o painel.

## Decisões

| Tema             | Decisão                                                                                                                                                                                                                                                                                       | Alternativas descartadas                                                                                       |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Encaixe          | Mesmo SPA (`/admin/*` com `React.lazy`) e mesmo backend Fastify                                                                                                                                                                                                                               | App separado (duplica build); backend separado (concorrência no SQLite)                                        |
| Autenticação     | Sessão no servidor: token aleatório em cookie `httpOnly`, `SameSite=Strict`, `Secure` fora de `localhost`; hash SHA-256 em `admin_sessions`; 8 h de inatividade                                                                                                                               | JWT em `localStorage` (roubável por XSS, sem revogação); `POST /usuario/login` da API (sem CRUD, HTTP sem TLS) |
| Senhas           | `scrypt` do `node:crypto` com sal aleatório, comparação em tempo constante, mínimo de 12 caracteres                                                                                                                                                                                           | bcrypt/argon2 (dependência nativa)                                                                             |
| Primeiro acesso  | `ADMIN_BOOTSTRAP_LOGIN`/`ADMIN_BOOTSTRAP_PASSWORD` criam o admin só se `admin_users` estiver vazia                                                                                                                                                                                            | Rota pública de cadastro                                                                                       |
| Sorteios         | `PUT /concurso/{id}` da API de bilhetes; backend faz GET, mescla e envia o registro completo                                                                                                                                                                                                  | Sobreposição local (dados divergentes da API)                                                                  |
| Campos editáveis | Prêmios, quantidade de prêmios, giros, dupla chance, datas de venda/sorteio, hora e valor do bilhete; preço e datas pedem confirmação                                                                                                                                                         | Só campos de exibição                                                                                          |
| Aprovar/cancelar | Aprovar `pending` ativo roda a mesma validação do webhook (`paid` ou `manual_review`); aprovar `manual_review` repete a validação; cancelar `pending` libera reservas; cancelar `manual_review` só marca `cancelled` (estorno fora do sistema); `expired` não é aprovável; motivo obrigatório | Aprovar só trocando status (bilhete não validado)                                                              |
| Clientes         | Derivados dos pedidos locais, agrupados por CPF                                                                                                                                                                                                                                               | API externa não lista pessoas                                                                                  |
| Gráficos         | SVG próprio com tabela alternativa para leitor de tela                                                                                                                                                                                                                                        | Recharts (+~100 KB)                                                                                            |
| Exportação       | CSV no backend, separador `;`, UTF-8 com BOM, valores com vírgula; CPF completo; cada exportação vai para a auditoria                                                                                                                                                                         | `.xlsx` com `exceljs`                                                                                          |
| YouTube          | Backend aceita só `youtube.com`/`youtu.be`, guarda o ID; Home mostra miniatura e só carrega `youtube-nocookie.com/embed` após clique                                                                                                                                                          | iframe direto; só botão                                                                                        |
| Entrega          | Uma spec, plano em 4 fases com `npm run check` e E2E a cada fase                                                                                                                                                                                                                              | Quatro ciclos separados                                                                                        |

## Backend

### Banco (migração v7)

- `admin_users(id, login UNIQUE, name, password_hash, active, created_at, updated_at)`
- `admin_sessions(token_hash PK, user_id FK ON DELETE CASCADE, created_at, last_seen_at, expires_at)`
- `admin_audit_log(id, user_id, action, target_id, details_json, created_at)`
- `site_settings(key PK, value, updated_at)`

### Domínio `server/domains/admin/`

- `password.ts`: hash e verificação `scrypt`.
- `admin-repository.ts`: usuários, sessões e auditoria.
- `admin-auth-service.ts`: login (mensagem genérica para usuário inexistente, inativo ou senha errada), logout, validação/renovação de sessão, bootstrap.
- `admin-user-service.ts`: CRUD; não exclui/desativa a si mesmo nem o último admin ativo; troca de senha encerra as demais sessões do usuário; desativar ou excluir encerra todas.
- Fases seguintes: `sales-query.ts`, `customer-query.ts`, `dashboard-query.ts`, `csv.ts`, `settings-service.ts`; ações de pedido no `OrderService` (validação extraída para `fulfill(order)`, `capture_method = 'manual'`); `updateContest` no `TicketGateway`.

### HTTP (`server/http/admin-routes.ts`)

- `POST /api/v1/admin/session` (rate limit 10/min por IP), `GET` (usuário atual), `DELETE` (logout).
- `/api/v1/admin/users[/:id]` nesta fase; depois `dashboard`, `orders`, `orders/:id/approve|cancel`, `orders.csv`, `customers`, `customers.csv`, `raffles[/:id]`, `settings`.
- `preHandler` exige sessão válida (401 `ADMIN_UNAUTHENTICATED`) e, em métodos de escrita, `Origin` igual a `PUBLIC_APP_URL` quando presente (403).
- Respostas admin com `Cache-Control: no-store`. Cookie lido e escrito com `@fastify/cookie`.
- Rota pública `GET /api/v1/site-settings` (fase 4).

## Frontend

- Feature `src/features/admin/{domain,api,repository,service,runtime,ui}`. Repository só em modo `live`; em `mock` o painel mostra que exige backend.
- Páginas em `src/pages/admin/*`, rotas `/admin/login`, `/admin`, `/admin/sorteios`, `/admin/vendas`, `/admin/clientes`, `/admin/configuracoes`, `/admin/usuarios`, carregadas com `React.lazy` fora do `AppLayout` público.
- `RequireAdmin` consulta a sessão; sem sessão redireciona para `/admin/login?next=…` (só caminhos internos `/admin`). 401 em qualquer chamada invalida a sessão no cache e volta ao login.
- `AdminLayout`: barra lateral no desktop, menu recolhível no celular, nome do usuário e "Sair".
- Componentes reutilizáveis em `src/features/admin/ui/`: `DataTable` (colunas tipadas, vazio, carregando), `ConfirmDialog` (`<dialog>` nativo, foco preso, Esc), `StatCard`, `StatusBadge`, `FormField`, gráficos SVG. Estilos em `src/app/admin.css` com os tokens já definidos em `:root`.

## Erros e segurança

- Login nunca revela se o usuário existe. Mesma demora para usuário inexistente (verificação contra hash fictício).
- Senha nunca volta em resposta nem em log.
- Ações de pedido, exportação, edição de sorteio, configuração e usuários registram auditoria.
- `manual_review` aparece como "Em análise" no painel, nunca como pago.

## Testes

- Vitest: senha, serviços de auth/usuários (regras), rotas com `app.inject` (401 sem cookie, login/logout, Origin, CRUD), componentes principais.
- Playwright: login com usuário de bootstrap, navegação protegida, logout; nas fases seguintes, aprovar/cancelar, exportar, editar sorteio, YouTube na Home.
