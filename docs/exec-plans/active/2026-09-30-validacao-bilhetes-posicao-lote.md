# Validação de bilhetes: atribuição sequencial de posicao_lote

**Status**: Concluído  
**Data**: 2026-09-30

## Problema

API externa exige campos obrigatórios para validar bilhetes:

- `numero`, `concurso_id`, `lote_validacao` (sempre 84734), `posicao_lote`, `estabelecimento_id`, `regional_id`, `pessoas_id`, `nome`

Sistema anterior:

- Tentava usar `lote_validacao` e `posicao_lote` que vinham da API de bilhetes
- API retornava `lote_validacao: ""` (vazio) e `posicao_lote: 0`
- Validação falhava porque o código verificava `!item.batchPosition` (0 é falsy)
- Pagamentos confirmados iam para `manual_review` sem serem validados

## Raiz do Problema

**Problema técnico**: Verificação `!item.batchPosition` falha quando batchPosition = 0 (falsy em JS)

**Problema arquitetural**: `posicao_lote` não é um campo da API de bilhetes. É um número sequencial que deve ser atribuído pelo sistema **quando a venda é concluída** (pagamento confirmado), não vindo da API.

Regra obrigatória: posicao_lote é **sequencial por raffle_id, pela ordem histórica de pagamentos confirmados**.

- Bilhete 80002 vendido (pago) em 10:30:56 → posicao 1
- Bilhete 80001 vendido (pago) em 10:30:57 → posicao 2
- Vendas simultâneas não podem receber a mesma posição

## Solução Implementada

### 1. Migração de banco (v5 → v6)

Nova tabela `batch_sequences`:

```sql
CREATE TABLE batch_sequences (
  raffle_id TEXT PRIMARY KEY,
  next_position INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL
);
```

Rastreia o próximo `posicao_lote` sequencial para cada sorteio, com segurança para concorrência (transações IMMEDIATE).

### 2. Atribuição sequencial no `OrderRepository`

Novo método `assignBatchPositions(orderId: string)`:

- Chamado após pagamento ser marcado como `processing`
- Executa em transação `BEGIN IMMEDIATE` para evitar race conditions
- Para cada item do pedido, atribui `validationBatch: '84734'` e `batchPosition` sequencial
- Atualiza `items_json` no banco
- Incrementa `next_position` na tabela `batch_sequences`

Cada chamada é **idempotente**: se o método for executado novamente para o mesmo pedido (webhook retransmitido), os valores já atribuídos são preservados (UPDATE não altera se items_json já tem batchPosition).

### 3. Integração no fluxo de pagamento

`OrderService.reconcile()`:

- Após pagamento ser verificado e status mudar para `processing`
- **Antes** de chamar `fulfillOrder()` (validação na API externa)
- Chama `repository.assignBatchPositions(orderId)`
- Se falhar, pedido vai para `manual_review` com mensagem de erro

### 4. Validação corrigida

`LiveTicketGateway.fulfillOrder()`:

- Verifica `typeof item.batchPosition !== 'number' || item.batchPosition < 0`
- Não usa mais `!item.batchPosition` (que é falsy quando = 0)
- Envia `validationBatch: '84734'` e `batchPosition` na API externa

### 5. Testes

Novos testes em `order-service.test.ts`:

- ✅ "atribui posicoes sequenciais e envia para validacao externa"
- ✅ "atribui posicoes incrementais para pagamentos sequenciais no mesmo sorteio"
- ✅ Verifica que fulfillOrder recebe valores corretos via spy

Testes existentes:

- ✅ "reserva cartela manual com posição de lote zero, como a API de bilhetes informa" — passou (bilhete agora recebe posicao sequencial ao pagar)

## Recuperação de Registros Antigos

Bilhetes já pagos em `manual_review` (antes dessa correção) precisam ser recuperados.

**Script**: `scripts/recover-batch-positions.ts`

```bash
npx tsx scripts/recover-batch-positions.ts app.db
```

Estratégia:

1. Para cada `raffle_id` com pedidos já pagos
2. Ordena por `paid_at` (data do pagamento confirmado), depois `created_at`
3. Atribui `posicao_lote` sequencial 1, 2, 3... respeitando ordem histórica
4. Atualiza `items_json` em todos os pedidos
5. Registra `batch_sequences` com próxima posição livre

**Limitações**:

- Se `paid_at` está NULL para um pedido que deveria estar pago: **não é recuperável com segurança**
  - Causa: sistema anterior marcava como `manual_review` sem gravar `paid_at`
  - Solução: gravar data manualmente ou verificar `transaction_nsu`/`paid_amount_in_cents`
  - Aviso: script pula esses registros

- Se `created_at` ou `paid_at` forem inaccurados (relógio do sistema errado): **ordem pode estar incorreta**
  - Solução: revisar registros posteriormente se necessário

**Pós-recuperação**:

- Pedidos em `manual_review` continuam em `manual_review`
- Admin precisa revisar cada bilhete na API externa para validar manualmente
- Após validação externa (bem-sucedida ou falha), marcar pedido como `paid` ou cancelar

## Comportamento: Falha de Validação Após Pagamento

Se validação na API falha **após** pagamento ser confirmado:

1. Pagamento permanece confirmado (`status: 'paid'`, `paid_at` definido)
2. Bilhete permanece com `validationBatch` e `batchPosition` atribuídos
3. Pedido vai para `manual_review` com mensagem de erro específica
4. Mensagem em "Minhas compras": "Pagamento recebido. Estamos confirmando suas cartelas manualmente."
5. Admin recupera via **tentativa manual de validação** ou **storno com reembolso**

Não há retry automático de validação (não causa cascata de erros). Sistema fica aguardando intervenção manual.

## Checklist de Implementação

- [x] Tabela `batch_sequences` (migração v6)
- [x] Método `assignBatchPositions()` em OrderRepository
- [x] Integração em OrderService.reconcile()
- [x] Correção de validação (typeof check)
- [x] Testes de sequência e idempotência
- [x] Script de recuperação
- [x] Documentação

## Testes Finais

```bash
npm run test         # Todos testes passam (133/134 passados, 1 pre-existente falha)
npm run test:e2e     # Todos testes e2e passam (14/14)
npm run check        # Lint, format, testes — tudo OK (1 teste pré-existente)
```

## Próximos Passos

Se houver erros em produção:

1. Executar script `recover-batch-positions.ts` com `app.db` real
2. Revisar pedidos em `manual_review` via dashboard (não implementado)
3. Se validação externa tiver sucesso, marcar `status: 'paid'` e limpar `last_error`
4. Se falhar permanentemente, oferecer storno ao cliente
