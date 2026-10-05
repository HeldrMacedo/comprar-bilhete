# Cards dos concursos na Home

## Objetivo e aceite

Trocar os checkboxes por filtros Todos (padrão), Quarta e Domingo; com um concurso, mostrar apenas seu botão. Exibir concursos lado a lado no desktop e em coluna no celular. Cada card mostra dia, data e hora, número, preço, dupla chance, prêmios, giros, quantidade, total e ação de carrinho. Preservar a compra conjunta.

## Contexto

Consultados `docs/PRODUCT.md`, `ARCHITECTURE.md`, `docs/FRONTEND.md`, `docs/BACKEND.md`, `docs/API_CONTRACTS.md` e `docs/SECURITY.md`. A consulta de 05/10/2026 a `/concurso/atual` retornou 2026042 (quarta, 20h) e 2026043 (domingo, 9h); ambos custam R$ 1,00 e têm dupla chance. Alguns campos de prêmio não vieram preenchidos.

## Etapas

- [x] Expor dupla chance e metadados de premiação já normalizados na fronteira frontend.
- [x] Reorganizar seleção e cards, mantendo compra individual e conjunta.
- [x] Ajustar CSS responsivo e testes de jornada.
- [x] Executar `npm run check` e `npm run test:e2e`.

## Decisões

Usar os prêmios reais fornecidos por concurso, sem fixar valores no layout. Dados de prêmio ausentes aparecem como pendentes. Os botões de cada card adicionam aquele concurso; a barra geral adiciona os dois quando Todos está ativo.

## Progresso e validação

05/10/2026: cards, filtros e contrato atualizados. Testes de Home e parser passaram (11 testes); Playwright passou em desktop e mobile (13 testes, 1 skip existente); lint, Prettier, arquitetura, documentação e build passaram. `npm run check` foi executado, mas o teste de `InfinitePayGateway` falha por uma URL de webhook fixa em alteração preexistente no arquivo de pagamentos, divergente da URL configurada que o teste exige. A configuração preexistente foi preservada; apenas sua formatação foi ajustada para permitir a verificação de Prettier.
