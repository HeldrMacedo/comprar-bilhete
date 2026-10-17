# Login de cliente

Status: aceito. Implementado com providers mock; o contrato de `POST /pessoa/cadastro` ainda não foi validado contra a API real (tarefa 0 do plano).

Spec completa: [superpowers/specs/2026-10-16-login-cliente-design.md](../superpowers/specs/2026-10-16-login-cliente-design.md). Plano: [exec-plans/active/2026-10-16-login-cliente.md](../exec-plans/active/2026-10-16-login-cliente.md).

## Decisão

A consulta de compras só por CPF foi considerada insegura pelo cliente. Entra uma conta de cliente (CPF e senha) com verificação por código de e-mail, e o checkout passa a exigir conta.

| Tema                    | Decisão                                                                                                                     |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Fonte do login          | Hash `scrypt` local no SQLite; a senha também vai à API por `POST /pessoa/cadastro` (não há login de `pessoa` na API)       |
| Sessão                  | Cookie `customer_session` (`HttpOnly`, `SameSite=Strict`), só o hash SHA-256 no banco, 30 dias sem uso                      |
| Verificação             | Código de 6 dígitos por e-mail (15 min, 5 tentativas, reenvio após 60 s) para cadastro, primeiro acesso e "esqueci a senha" |
| E-mail                  | Porta com providers `smtp` (Nodemailer) e `mock`                                                                            |
| CPF já na API sem conta | Primeiro acesso por código ao e-mail gravado na API, nunca a um e-mail digitado                                             |
| CPF na API sem e-mail   | Orientação para lotérica ou suporte; admin gera código de 24 h, só para CPF sem e-mail                                      |
| CPF novo                | E-mail confirmado por código antes de criar `pessoa` e a conta                                                              |
| Checkout                | Exige sessão; o comprador vem da conta; o corpo só traz `beneficiaryName` e e-mail do pedido                                |
| Minhas compras          | `GET /api/v1/orders/mine` pela sessão; removidos `customers/lookup` e `orders/lookup`                                       |

## Consequências

- `identify` revela se o CPF tem cadastro (risco aceito pelo cliente em 16/10/2026); limites por IP e por CPF vivem em memória e exigem `TRUST_PROXY` atrás de proxy. Ver [SECURITY.md](../SECURITY.md) e o rastreador de dívida.
- Com `MAIL_PROVIDER=mock`, o código é fixo `000000` apenas quando bilhetes e pagamento também são mock; com provider live o código é aleatório e nunca entregue, então produção precisa de SMTP.
- A senha trafega até a API de bilhetes, sem TLS enquanto `TICKET_API_ALLOW_HTTP=true`.
- Contratos e códigos de erro em [API_CONTRACTS.md](../API_CONTRACTS.md).
