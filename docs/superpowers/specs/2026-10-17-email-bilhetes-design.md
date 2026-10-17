# E-mail com a cartela dos bilhetes após o pagamento

## Objetivo

Quando um pedido vira `paid`, o cliente recebe por e-mail a cartela de cada bilhete comprado
(números da 1ª e da 2ª chance sob cada prêmio) e um PDF com os bilhetes em anexo, no formato
do comprovante impresso da Sol da Sorte.

## Decisões

| Tema              | Decisão                                                                                                           | Alternativas descartadas                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| Quando enviar     | Sempre que o pedido vira `paid`: webhook, aprovação manual no painel e reprocessamento de pedido em análise       | Só no webhook da InfinitePay                               |
| Corpo do e-mail   | HTML com a cartela no corpo (tabelas e estilo inline, sem imagens) e versão em texto puro                         | Imagem como corpo                                          |
| Anexo             | Um PDF com todos os bilhetes do pedido, um por página, gerado com `pdfkit`                                        | PNG por bilhete (`@napi-rs/canvas`); PNG e PDF juntos      |
| Falha no envio    | Fila no SQLite com novas tentativas; após 5 falhas fica `failed` e o painel oferece "Reenviar e-mail"             | Só log; tentativa única                                    |
| Nome do bilhete   | `BILHETE <identificacao>` (coluna `identificacao` da API); pedidos antigos sem o campo usam o `numero`            | `numero`                                                   |
| Dados pessoais    | Corpo do e-mail só com o nome. PDF com nome, cidade e CPF mascarado (`***.950.174-**`); sem telefone nem endereço | CPF completo e telefone, como no comprovante compartilhado |
| Pedido sem e-mail | Nada é enviado; o registro fica `no_recipient` e o painel mostra "Sem e-mail"                                     | Bloquear a compra                                          |

## Fluxo

1. `OrderRepository.markPaid` passa a gravar, na mesma transação que muda o status, uma linha
   em `order_emails` com `INSERT OR IGNORE`. Como `order_id` é a chave, webhook repetido,
   reprocessamento ou nova aprovação não geram segundo e-mail. Sem `customer.email`, a linha
   nasce `no_recipient`.
2. O worker de 5 s de `server/app.ts` chama também `ticketEmails.processNext()`.
3. `processNext` reserva um item `pending` com `next_attempt_at <= agora` num único
   `UPDATE ... RETURNING` que empurra `next_attempt_at` 10 minutos à frente (se o processo cair
   no meio do envio, o item volta sozinho). Lê o pedido atual, monta o e-mail e o PDF e envia.
4. Sucesso: `status = 'sent'`, `sent_at`. Falha: `attempts + 1`, `last_error` só com campos
   técnicos do nodemailer (`code`, `responseCode`, `command`), próxima tentativa em 1 min,
   5 min, 30 min e 2 h; na 5ª falha, `status = 'failed'`.
5. Reenvio pelo painel: `POST /api/v1/admin/orders/:id/resend-email` volta o item para
   `pending`, `attempts = 0`, `next_attempt_at = agora`, e registra na auditoria do admin.
   Aceito para `sent` e `failed`; `pending` responde `409 EMAIL_ALREADY_QUEUED` e
   `no_recipient` responde `409 EMAIL_NO_RECIPIENT`. Pedido que não é `paid` responde `409`.

## Backend

### Banco (migração v9)

`order_emails(order_id PK FK orders, status CHECK IN ('pending','sent','failed','no_recipient'),
attempts INTEGER DEFAULT 0, next_attempt_at, last_error, sent_at, created_at, updated_at)`,
com índice em `(status, next_attempt_at)`.

### Módulos

- `server/domains/ticket-emails/ticket-email-repository.ts`: `claimNext`, `markSent`,
  `markFailedAttempt`, `requeue`, `getStatuses(orderIds)`. O `enqueue` fica dentro de
  `markPaid`, no `OrderRepository`, para ser atômico com o status.
- `ticket-email-service.ts`: `processNext()` e `resend(orderId)`, com a tabela de intervalos.
- `ticket-card.ts`: função pura que recebe o pedido e devolve a estrutura da cartela
  (cabeçalho, bilhetes, prêmios com as duas grades em linhas de 5 números, giros, valor, lote,
  posição, data da compra, rodapé). HTML, texto e PDF são montados a partir dela.
- `ticket-card-email.ts`: estrutura → `{ subject, html, text }`. Todo texto vindo do pedido
  passa por escape HTML.
- `ticket-card-pdf.ts`: estrutura → `Buffer` com `pdfkit`, A4, fonte Helvetica embutida no
  pdfkit (cobre acentos, `ª`, `º` e `•`), um bilhete por página.
- `MailGateway` ganha `send({ to, subject, html, text, attachments })`. O SMTP reaproveita o
  transporter e os limites de tempo atuais; em falha, lança `MailDeliveryError` com os campos
  técnicos. O mock guarda as mensagens enviadas em memória.

Cabeçalho (nome e endereço da Sol da Sorte) e rodapé de premiação são os do comprovante do
navegador (`src/features/purchases/service/receipt.ts`). O servidor tem a própria cópia; um
teste compara as duas para não divergirem.

### E-mail

Assunto: `Seus bilhetes Sol da Sorte — pagamento confirmado`. Topo com "Olá, <nome>", total
pago, data do pagamento e botão "Ver meus bilhetes" (`PUBLIC_APP_URL/minhas-compras`). Uma
cartela por bilhete, largura máxima de 600 px:

```
┌────────────────────────────────────────┐
│ SOL DA SORTE           (faixa #0062ff) │
│ BILHETE 60410080001-00                 │
│ Sorteio 25/10/2026                     │
├────────────────────────────────────────┤
│ 1 AVELLOZ AZ1                          │
│   1ª CHANCE            2ª CHANCE       │
│ ┌──┬──┬──┬──┬──┐   ┌──┬──┬──┬──┬──┐    │
│ │03│11│27│38│45│   │02│09│14│33│50│    │
│ │..│..│..│..│..│   │..│..│..│..│..│    │
│ └──┴──┴──┴──┴──┘   └──┴──┴──┴──┴──┘    │
├────────────────────────────────────────┤
│ (repete para cada prêmio)              │
├────────────────────────────────────────┤
│ 5 GIROS DA SORTE (se houver)           │
│ Valor R$ 10,00 · Lote 77 · Posição 3   │
│ Venda online · Compra em 17/10 14:32   │
└────────────────────────────────────────┘
```

Sem 2ª chance, a grade da 1ª ocupa a largura toda. Bilhete sem prêmios mostra uma única grade
sem título, como o comprovante atual. No celular, as duas grades empilham. Rodapé com o texto de
premiação e o endereço. A versão em texto reproduz o layout do comprovante compartilhado.

Anexo: `bilhetes-<8 primeiros caracteres do pedido>.pdf`, gerado na hora do envio e nunca
guardado em disco.

### Admin

O presenter de vendas passa a devolver `emailStatus` (`pending | sent | failed | no_recipient`,
ausente em pedido não pago). `AdminSalesPage` ganha a coluna "E-mail" (Na fila, Enviado,
Falhou, Sem e-mail) e, para pedido `paid` com `sent` ou `failed`, a ação "Reenviar e-mail" no
padrão de `OrderActionDialog`.

## Testes

- `ticket-card`: grades de 5 colunas sob cada prêmio, 2ª chance opcional, bilhete sem prêmios,
  `identificacao` com alternativa para `numero`, CPF mascarado.
- `ticket-card-email`: escape de HTML, sem CPF no corpo, link de "Meus bilhetes".
- `ticket-card-pdf`: gera PDF válido (`%PDF-`) com uma página por bilhete.
- `ticket-email-service`: envio, intervalos de nova tentativa, `failed` na 5ª falha,
  `no_recipient`, item reservado não é pego de novo, `last_error` sem destinatário.
- `order-service`: webhook, aprovação manual e reprocessamento enfileiram; webhook repetido não
  duplica.
- Rota de reenvio: estados aceitos, 409s e auditoria.
- Cabeçalho e rodapé iguais aos do comprovante do navegador.
- E2E: compra mock termina com "Enviado" na lista de vendas do admin.
- `npm run check` e `npm run test:e2e`.

## Documentação

`docs/API_CONTRACTS.md` (rota de reenvio e `emailStatus`), `docs/SECURITY.md` (dados pessoais
no e-mail e no PDF, `last_error` sem destinatário), `docs/PRODUCT.md` (e-mail pós-pagamento) e
`ARCHITECTURE.md` (novo domínio `ticket-emails`).

## Fora do escopo

- E-mail de pedido expirado, cancelado ou em análise.
- Escolha do e-mail de destino pelo cliente depois da compra.
- Limite diário do provedor SMTP: com Gmail, cerca de 500 envios por dia; picos acima disso
  ficam na fila e acabam `failed` até o reenvio.
