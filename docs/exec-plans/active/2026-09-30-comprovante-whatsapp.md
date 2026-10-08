# Comprovante de bilhete para WhatsApp

Especificação: [../../superpowers/specs/2026-09-30-comprovante-whatsapp-design.md](../../superpowers/specs/2026-09-30-comprovante-whatsapp-design.md)

## Objetivo e critérios de aceite

- Pedido `paid` em "Minhas compras" mostra "Compartilhar no WhatsApp" (todas os bilhetes) e um botão por bilhete.
- Cada bilhete vira um PNG no formato do comprovante impresso: cabeçalho fixo, BILHETE, SORTEIO, prêmios com dezenas da 1ª e 2ª chance, giros, valores, `VENDA: ONLINE`, LOTE e POSIÇÃO, data da compra, dados do cliente e rodapé fixo.
- No celular, abre o menu de compartilhar com os arquivos; sem suporte, baixa os PNGs e avisa.
- Dados pessoais só aparecem na resposta de pedidos `paid`.
- Pedidos antigos, sem prêmios ou identificação, ainda geram comprovante.

## Contexto consultado

- `/concurso/atual` (30/09/2026) traz `premio_01..05_sorteio*`, `qtd_giros_sorteio*`, `giros_sorteio*` e `dupla_chance_sorteio*`.
- `/bilhete/disponiveis` traz `identificacao` (registrado em `docs/API_CONTRACTS.md`).
- Lote `84734` e posição são atribuídos em `OrderRepository.assignBatchPositions` ao confirmar o pagamento.

## Etapas

### 1. Prêmios e giros no concurso

- `server/domains/tickets/ticket-gateway.ts`: `Raffle` ganha `prizes?: string[]` e `luckySpins?: { count: number; label: string }`.
- `server/domains/tickets/current-contests.ts`: os schemas CAP/ESP aceitam `premio_01..05_sorteio*` opcionais; `prizes` recebe os não vazios com espaços internos normalizados; `luckySpins` só quando `qtd_giros > 0`.
- Teste em `current-contests.test.ts`: prêmios na ordem, vazios/`null` ignorados, giros presentes no CAP e ausentes no ESP com `qtd_giros` zero.
- Mock (`mock-ticket-gateway.ts`) com prêmios e giros.

### 2. Identificação do bilhete

- `order-types.ts`: `ticketSchema` ganha `identification`, `drawDate`, `prizes` e `luckySpins`, todos opcionais.
- `live-ticket-gateway.ts`: lê `identificacao` opcional e mapeia para `identification` só quando não vazio.
- Teste em `live-ticket-gateway.test.ts` com o formato observado (`60410080001-22`).
- Mock gera identificação por bilhete.

### 3. Cópia dos dados do concurso no pedido

- `order-service.ts`: no sorteio único, cada item recebe `drawDate`, `prizes` e `luckySpins` do concurso; em dois sorteios, `PreparedOrderGroup` leva esses campos e `createGrouped` os copia para os itens.
- Teste em `order-service.test.ts`: pedido criado guarda os dados do concurso em cada bilhete.

### 4. Resposta de "Minhas compras"

- `order-presenter.ts`: `presentPurchase` em pedido `paid` acrescenta `customer` (`name` do titular, `city`, `phone`, `cpf`) e, nos itens, `identification`, `drawDate`, `prizes`, `luckySpins`, `validationBatch`, `batchPosition`.
- `purchase-lookup-routes.test.ts`: o teste de privacidade passa a exigir os dados no pedido pago e a ausência deles no pendente.
- Atualizar `docs/exec-plans/tech-debt-tracker.md`, `docs/SECURITY.md` (se citar a regra) e `docs/PRODUCT.md`.

### 5. Modelo do comprovante (frontend)

- `src/features/purchases/api/schemas.ts` e `domain/types.ts`: campos novos opcionais.
- `src/features/purchases/service/receipt.ts`: `buildReceipt(purchase, item): ReceiptLine[]`, com `ReceiptLine` = régua dupla, régua simples, linha centralizada, linha à esquerda, par de colunas ou espaço.
- Teste `receipt.test.ts`: pedido completo, sem 2ª chance e antigo.

### 6. Imagem e compartilhamento

- `src/features/purchases/runtime/share-receipt.ts`: `renderReceiptPng(lines): Promise<Blob>` com `<canvas>` e `shareReceipts(files)` (`navigator.share` ou download).
- `src/features/purchases/ui/ShareReceiptButton.tsx`: estado de carregamento, mensagem de fallback e erro.
- `PurchasesPage.tsx`: botão do pedido e botão por bilhete só em `paid`; mock de `purchase-repository.ts` com dados completos.
- Testes em `PurchasesPage.test.tsx`: botão só em `paid` e `navigator.share` com um arquivo por bilhete (renderizador simulado).
- E2E em `tests/e2e/purchases.spec.ts`: botão visível após a compra demonstrativa.

### 7. Verificação

- `npm run check` e `npm run test:e2e`.
- Conferir a imagem gerada no navegador contra o modelo.

## Decisões

Ver a especificação. Alternativas descartadas: texto via `wa.me` (colunas quebram) e imagem única por pedido (mistura sorteios).

## Progresso

- 30/09/2026: especificação aprovada e plano criado.
- 30/09/2026: etapas 1 a 7 concluídas. Imagem gerada no Chromium (modo mock) conferida contra a foto do bilhete impresso; tela conferida em 1280 px e 412 px.

## Validação

- `npm run check`: lint, prettier, arquitetura, docs, 149 testes e build passando.
- `npm run test:e2e`: 13 passaram, 1 pulado (atalho do cabeçalho não existe no mobile).
- Não validado: menu de compartilhar real em Android/iOS (o Chromium headless não tem `navigator.share` com arquivos, então caiu no download) e pedido pago no modo live.
