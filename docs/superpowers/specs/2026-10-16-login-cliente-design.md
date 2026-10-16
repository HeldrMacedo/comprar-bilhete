# Login de cliente (botão "Entrar")

## Objetivo

Substituir a consulta de compras só por CPF, considerada insegura pelo cliente, por uma conta de cliente com CPF e senha. O botão **Entrar**, ao lado do carrinho, dá acesso a login e cadastro. O checkout passa a exigir conta: quem não tem cadastro se cadastra antes de pagar.

## Decisões

| Tema                          | Decisão                                                                                                                                                           | Alternativas descartadas                                                                                        |
| ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Fonte do login                | Hash `scrypt` local no SQLite (`customer_accounts`); a senha também é enviada para a API por `POST /pessoa/cadastro`                                              | Login pela API externa (não há endpoint de login de `pessoa`; `/usuario/login` é de usuário do estabelecimento) |
| Sessão                        | Token aleatório em cookie `customer_session` `HttpOnly`/`SameSite=Strict`/`Secure` fora de `localhost`; apenas hash SHA-256 no banco; expira após 30 dias sem uso | JWT (sem revogação no logout ou na troca de senha)                                                              |
| Verificação                   | Código de 6 dígitos por e-mail, mesmo mecanismo para cadastro novo, primeiro acesso e "esqueci a senha"                                                           | WhatsApp (API oficial paga; libs não oficiais violam termos); SMS (sem opção gratuita)                          |
| Envio de e-mail               | Porta + providers `smtp` (Nodemailer, qualquer SMTP gratuito: Gmail, Brevo, Resend) e `mock`                                                                      | Provedor fixo no código                                                                                         |
| CPF já na API sem conta local | Primeiro acesso: código enviado ao e-mail **gravado na API**, nunca a um e-mail digitado                                                                          | Cadastro livre (quem sabe o CPF toma a conta); confirmar celular (fraco)                                        |
| CPF na API sem e-mail         | Bloqueia com orientação para procurar a lotérica/suporte; admin pode gerar código de primeiro acesso no painel                                                    | Liberar confirmando celular                                                                                     |
| CPF novo                      | Código enviado ao e-mail digitado antes de criar `pessoa` e a conta                                                                                               | Criar sem verificar (e-mail errado impede recuperação; terceiro registra CPF alheio)                            |
| Endereço                      | Cadastro pede endereço completo, enviado ao `/pessoa/cadastro`; o que a API não guardar fica em `customer_accounts`                                               | Só CEP e cidade, endereço por pedido                                                                            |
| Checkout                      | Exige sessão; comprador vem da sessão; corpo do pedido só traz `beneficiaryName` e e-mail do pedido                                                               | Checkout anônimo com cadastro implícito (comportamento atual)                                                   |
| Minhas compras                | `GET /api/v1/orders/mine` pela sessão; pedidos antigos aparecem pelo CPF da conta                                                                                 | Manter `POST /orders/lookup` por CPF                                                                            |

## Pré-requisito: contrato de `POST /pessoa/cadastro`

O swagger só traz o exemplo `{nome, cpf, senha, confirma_senha, email, fone, cidade, cep}` e diz que o endpoint grava ou edita. Antes de implementar, testar com um CPF de teste autorizado pelo responsável (grava na API real):

1. Cadastro de CPF novo: formato da resposta (traz `pessoas_id`?), códigos de erro.
2. Campos extras `endereco`, `numero`, `complemento`, `bairro`, `uf`: aceitos e gravados?
3. Edição: é preciso reenviar `senha`/`confirma_senha`? Campos omitidos são apagados?
4. Edição de CPF que já existe sem senha (cadastrado na lotérica ou por `POST /pessoa`).

O resultado vai para `docs/API_CONTRACTS.md` e pode ajustar o que fica só no SQLite.

## Backend

### Banco (migração v8)

- `customer_accounts(cpf PK, external_id, name, email, phone, address_json, password_hash, created_at, updated_at, password_changed_at)`
- `customer_sessions(token_hash PK, cpf FK ON DELETE CASCADE, created_at, last_seen_at, expires_at)`
- `verification_codes(id PK, cpf, purpose, code_hash, email, attempts, created_at, expires_at, used_at, created_by_admin_id)`, com `purpose` em `signup | first_access | reset | admin`.

### Domínio `server/domains/accounts/`

- `account-repository.ts`: contas, sessões e códigos.
- `verification-service.ts`: gera código de 6 dígitos (`crypto.randomInt`), guarda só o hash, valida por 15 minutos, no máximo 5 tentativas, reenvio após 60 segundos; ao emitir um código novo, invalida os anteriores da mesma finalidade. Código gerado pelo admin vale 24 horas.
- `account-service.ts`: `identify`, `login`, `register`, `setPassword`, `updateProfile`, `logout`, `authenticate`. Reaproveita `hashPassword`/`verifyPassword` de `server/domains/admin/password.ts` (mover para `server/shared/password.ts`). Senha com no mínimo 8 caracteres. Login com usuário inexistente gasta o mesmo tempo de `scrypt` que senha errada.
- `mail-gateway.ts`, `mock-mail-gateway.ts`, `smtp-mail-gateway.ts`: `MailGateway` com `SmtpMailGateway` e `MockMailGateway`. Em mock, o código é fixo (`000000`), para testes e E2E. O texto do e-mail informa o código, a validade e que ninguém da Sol da Sorte pede esse código.
- No mock da API, Maria (`52998224725`) passa a ter e-mail, para cobrir o primeiro acesso.
- `CustomerGateway` ganha `register(input)`, que chama `POST /pessoa/cadastro` com `senha` e `confirma_senha`, e `requireTicketApiTls`.

### Ambiente (`server/config/env.ts`)

`MAIL_PROVIDER=mock|smtp`, `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`. Com `smtp`, todas são obrigatórias, exceto `SMTP_SECURE`.

### HTTP (`server/http/account-routes.ts`)

Todas as rotas com `Cache-Control: no-store`; escritas conferem `Origin` contra `PUBLIC_APP_URL`, como no admin.

- `POST /api/v1/account/identify {cpf}` devolve `{ status }`:
  - `account`: há conta local; pedir senha.
  - `first_access`: CPF existe na API com e-mail; inclui `maskedEmail` (`jo***@gmail.com`).
  - `no_email`: CPF existe na API sem e-mail; orientar procurar lotérica/suporte ou usar código do admin.
  - `new`: abrir cadastro.
    Revela se o CPF está cadastrado (exigência do cliente). Limite de 10 por minuto por IP.
- `POST /api/v1/account/login {cpf, password}`: cria a sessão. Falha com `401 INVALID_CREDENTIALS` e mensagem genérica. Limite de 10 falhas por minuto por IP e 5 por 15 minutos por CPF.
- `POST /api/v1/account/codes {cpf, purpose, email?}`: envia o código. `signup` exige `email` e só vale para CPF sem conta e fora da API; `first_access` e `reset` usam sempre o e-mail da API (ou da conta local, se a API não tiver). Sempre responde `202`, sem confirmar entrega.
- `POST /api/v1/account/register {customer, password, code}`: confere o código de `signup`, chama `/pessoa/cadastro` e relê `GET /pessoa/cpf/{cpf}` para obter `pessoas_id`. Só então cria a conta local e a sessão. Se a API falhar, nada local é criado e o código continua válido até expirar.
- `POST /api/v1/account/password {cpf, code, password, email?}`: primeiro acesso, "esqueci a senha" e código do admin. Envia a senha (e, no código do admin, o e-mail informado) para `/pessoa/cadastro`, grava o hash local, encerra as demais sessões do CPF e cria uma nova.
- `GET /api/v1/account/me`: dados da conta ou `401 UNAUTHENTICATED`.
- `PUT /api/v1/account/profile {customer, currentPassword}`: confere a senha atual e envia os dados para `/pessoa/cadastro` com ela.
- `POST /api/v1/account/logout`: apaga a sessão e o cookie.
- `POST /api/v1/admin/customers/:cpf/access-code`: admin autenticado gera código `admin`, mostrado uma única vez na resposta; fica em `admin_audit_log`.

### Pedidos

- `POST /api/v1/orders` exige sessão. O comprador vem de `customer_accounts` (com `externalId`); o corpo traz apenas itens, `beneficiaryName` e e-mail do pedido (padrão: e-mail da conta).
- `CustomerService.resolveForOrder` passa a receber a conta; `ensureRegistered` continua como salvaguarda para conta sem `externalId`.
- `GET /api/v1/orders/mine` substitui `POST /api/v1/orders/lookup`; mesmo presenter e mesmas regras de dados pessoais.
- `GET /api/v1/orders/:id` não muda: `presentOrder` não devolve dados pessoais.
- Removidos: `GET /api/v1/customers/lookup` e `POST /api/v1/orders/lookup`.

## Frontend

### Feature `src/features/account/{domain,api,repository,service,runtime,ui}`

- `AccountProvider`/`useAccount` lê `/me` e expõe `login`, `logout` e `refresh`.
- `ui/AuthFlow`: fluxo em etapas reutilizado na página e no checkout:
  1. CPF.
  2. Conforme `status`: senha (com "Esqueci minha senha"), cadastro (nome, CPF, celular, e-mail, endereço, senha e confirmação), primeiro acesso (mostra o e-mail mascarado e envia o código) ou mensagem de `no_email` com campo para código do admin.
  3. Código: campo de 6 dígitos, reenvio com contagem de 60 s; no primeiro acesso e em "esqueci a senha", nova senha.

### Páginas e cabeçalho

- Cabeçalho: o campo de CPF sai e entra o botão **Entrar** ao lado do carrinho. Logado, vira **Minha conta**, com menu acessível por teclado: Minhas compras, Meus dados e Sair.
- `/entrar` (aceita `?next=` interno), `/minha-conta` (dados e edição) e `/minhas-compras` (exige sessão; sem sessão leva a `/entrar?next=/minhas-compras`).
- `CartPage`: sem sessão, mostra o `AuthFlow` no lugar do formulário e volta ao carrinho ao concluir. Com sessão, mostra o resumo dos dados (nome, CPF mascarado, celular, endereço) com link "Editar", o campo de e-mail do pedido e "Estou comprando para outra pessoa".
- Removidos: `use-customer-lookup` e `customer-repository` do checkout, campo de CPF do cabeçalho e de "Minhas compras".

## Segurança

- Código e senha nunca vão para log, resposta ou URL.
- O e-mail de destino do primeiro acesso e do "esqueci a senha" vem sempre do cadastro; nunca de entrada do navegador.
- Troca de senha encerra todas as outras sessões do CPF.
- O item "Minhas compras autentica só por CPF" sai do rastreador de dívida; entra "identify revela CPF cadastrado (risco aceito)".
- CPF, senha e código trafegam entre backend e API por HTTP enquanto `TICKET_API_ALLOW_HTTP=true` (dívida existente, agora inclui senha).

## Erros

- API externa fora do ar no cadastro ou na troca de senha: `502` com mensagem "Não foi possível concluir agora, tente novamente"; nada local muda.
- SMTP falhando: registra o erro sem o código e responde `503 MAIL_UNAVAILABLE`.
- Código inválido, expirado ou com tentativas esgotadas: `400 INVALID_CODE`, mensagem única.
- Sessão expirada no checkout: o carrinho continua; o `AuthFlow` reaparece.

## Testes

- Unitários: `verification-service` (expiração, tentativas, reenvio, invalidação), `account-service` (cada estado de `identify`, falha da API sem efeito local, troca de senha encerrando sessões), gateway `register` com `fetch` simulado.
- Rotas: login, rate limit, `Origin`, `orders/mine`, pedido exigindo sessão, código do admin.
- Frontend: `AuthFlow` nos quatro estados, cabeçalho logado/deslogado, `CartPage` com e sem sessão.
- E2E (`MAIL_PROVIDER=mock`): cadastro novo até pagamento, login de conta existente até Minhas compras, "esqueci a senha".

## Documentação

Atualizar `docs/PRODUCT.md`, `docs/API_CONTRACTS.md`, `docs/SECURITY.md`, `ARCHITECTURE.md` (feature `account`, domínio `accounts`), `.env.example`, `docs/exec-plans/tech-debt-tracker.md`; design doc em `docs/design-docs/`; plano em `docs/exec-plans/active/`.
