# Comprovante de bilhete para WhatsApp

Data: 30/09/2026

## Objetivo

Em "Minhas compras", pedidos com status `paid` ganham um botão para compartilhar os bilhetes no WhatsApp como imagem, no formato do comprovante impresso da Sol da Sorte (cabeçalho, bilhete, prêmios, dezenas das duas chances, valores, lote, dados do cliente e rodapé).

## Decisões

- **Formato:** imagem PNG gerada no navegador com `<canvas>`, sem dependência nova. Texto via `wa.me` foi descartado porque as colunas da 1ª e da 2ª chance quebram no celular.
- **Uma imagem por bilhete.** Cada comprovante tem `QUANTIDADE: 1` e valor do bilhete. O botão do pedido compartilha todas as imagens; cada bilhete tem também botão próprio.
- **Dados do cliente iguais ao modelo:** nome do titular (`beneficiaryName` quando a compra é para terceiro, senão o nome do comprador), cidade (quando o cadastro tem endereço), telefone e CPF do comprador.
- **Sem segundo fator.** Decisão de negócio de 30/09/2026: "Minhas compras" continua autenticando só por CPF, e a resposta passa a expor esses dados pessoais em pedidos `paid`. O risco (LGPD) fica registrado no rastreador de dívida. Pedidos em outros status continuam sem dado pessoal.
- **VENDA:** `ONLINE`. **LOTE:** o `lote_validacao` fixo (`84734`) e a **POSIÇÃO** (`posicao_lote`) do bilhete. **AGENTE:** não aparece.
- **Data e hora da compra:** `paidAt`, no fuso `America/Fortaleza`.
- **Cópia dos dados do concurso no pedido:** cada bilhete guarda, ao criar o pedido, a data do sorteio, os prêmios e os giros. O comprovante não depende do concurso continuar ativo na API.

## Fontes dos dados

| Campo do comprovante            | Origem                                                                                                                                     |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| BILHETE                         | `identificacao` de `/bilhete/disponiveis` e `/bilhete/disponivel/numero` (ex.: `60390093108-38`); pedidos antigos usam o número do bilhete |
| SORTEIO                         | `data_sorteio*` de `/concurso/atual` (já em `Raffle.drawDate`)                                                                             |
| Prêmios                         | `premio_01..05_sorteio*` não vazios, sem espaços extras, de `/concurso/atual`                                                              |
| Giros                           | `qtd_giros_sorteio*` e `giros_sorteio*`; omitido quando a quantidade é zero                                                                |
| Dezenas                         | `numbers` (1ª chance) e `secondChanceNumbers` (2ª chance)                                                                                  |
| VALOR DA DOAÇÃO / TOTAL A PAGAR | `unitPriceInCents` do bilhete                                                                                                              |
| LOTE / POSIÇÃO                  | `validationBatch` / `batchPosition`, atribuídos na confirmação do pagamento                                                                |
| Data e hora da compra           | `paidAt` do pedido                                                                                                                         |
| Dados do cliente                | `customer` do pedido                                                                                                                       |

## Layout do comprovante

Fundo branco, texto preto, largura próxima de 460 px (desenhado em escala 2x). Na ordem:

1. Linha dupla `=`; cabeçalho centralizado e fixo:
   ```
   SOL DA SORTE
   SLB - Sistema Lotérico da Bahia
   Av. Orlando Oliveira Pires, 266A
   Centro - Jacobina - Bahia
   ```
2. Linha simples; `BILHETE <identificação>` e `SORTEIO: dd/mm/aaaa`; linha dupla.
3. Títulos `1ª Chance` e `2ª Chance` em colunas; linha simples.
4. Para cada prêmio: nome do prêmio, linha simples, dezenas em linhas de 5 separadas por `-`, 1ª chance à esquerda e 2ª à direita. Sem prêmios (pedido antigo): um único bloco de dezenas sem título. Sem 2ª chance: só a coluna esquerda e sem o título `2ª Chance`.
5. Se houver giros: linha dupla, `<n> GIROS DA SORTE` e o texto de `giros_*`.
6. Linha dupla; `VALOR DA DOAÇÃO: R$ x`, `QUANTIDADE: 1`, `TOTAL A PAGAR: R$ x`, `VENDA: ONLINE`, `LOTE: 84734   POSIÇÃO: n`, `DATA DA COMPRA: dd/mm/aaaa hh:mm`.
7. Linha dupla; `DADOS DO CLIENTE`, linha simples, `NOME:`, cidade (se houver), `FONE:`, `CPF:` formatado.
8. Linha dupla; rodapé fixo:
   ```
   Parabéns, sua compra foi realizada com sucesso!

   Atenção: Em caso de premiação, favor encaminhar os seguintes documentos para o recebimento e/ou retirada do prêmio:

   • Documentação pessoal
   • Comprovante de endereço
   ```

## Componentes

### Backend

- `current-contests.ts`: `Raffle` ganha `prizes: string[]` e `luckySpins?: { count: number; label: string }`.
- `live-ticket-gateway.ts`: lê `identificacao` e expõe `Ticket.identification`.
- `order-types.ts`: o item do pedido ganha `identification`, `drawDate`, `prizes` e `luckySpins`, todos opcionais (pedidos antigos continuam válidos; itens ficam em `items_json`, sem migração).
- `order-service.ts`: copia `drawDate`, `prizes` e `luckySpins` do concurso para cada bilhete, nos caminhos de sorteio único e de dois sorteios.
- `order-presenter.ts`: `presentPurchase` inclui `customer` e os campos do comprovante nos itens somente quando `status === 'paid'`.
- Mocks (`mock-ticket-gateway.ts`) passam a ter prêmios, giros e identificação.

### Frontend (`src/features/purchases`)

- `api/schemas.ts` e `domain/types.ts`: item com campos do comprovante e `customer` opcionais.
- `service/receipt.ts`: função pura `buildReceipt(purchase, item)` que devolve as linhas do comprovante (texto, colunas e réguas), sem acesso ao DOM.
- `runtime/share-receipt.ts`: desenha as linhas em `<canvas>`, gera `File` PNG por bilhete e compartilha com `navigator.share({ files })` quando `navigator.canShare({ files })` permite; senão baixa os arquivos e informa "Comprovantes salvos. Anexe no WhatsApp.".
- `ui/ShareReceiptButton.tsx`: botão com estado de carregamento e mensagem de erro/fallback.
- `PurchasesPage.tsx`: em pedidos `paid`, botão "Compartilhar no WhatsApp" para todas os bilhetes e botão por bilhete.

## Erros

- Cancelamento do menu de compartilhar (`AbortError`) não mostra erro.
- Falha ao gerar imagem ou compartilhar mostra "Não foi possível gerar o comprovante. Tente novamente." no próprio card.
- `manual_review` e demais status nunca mostram o botão.

## Testes

- Backend: parsing de prêmios e giros; leitura de `identificacao`; cópia dos dados do concurso nos itens; "Minhas compras" com dados pessoais só em `paid` e sem eles em `pending`.
- Frontend: `buildReceipt` com pedido completo, sem 2ª chance e antigo; botão só em `paid`; `navigator.share` chamado com um arquivo por bilhete; fallback de download.
- E2E: o botão aparece em "Minhas compras" após a compra demonstrativa.
- O desenho do canvas não roda no jsdom e é conferido no navegador.

## Fora de escopo

- Segundo fator de autenticação em "Minhas compras".
- Comprovante para pedidos que não estejam `paid`.
