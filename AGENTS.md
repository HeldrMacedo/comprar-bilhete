# Mapa para agentes

Este arquivo é um índice, não um manual. Leia somente os documentos relevantes à tarefa.

## Antes de alterar

1. Leia [docs/PRODUCT.md](docs/PRODUCT.md) para comportamento e critérios de aceite.
2. Leia [ARCHITECTURE.md](ARCHITECTURE.md) e os guias [docs/FRONTEND.md](docs/FRONTEND.md) e [docs/BACKEND.md](docs/BACKEND.md).
3. Para APIs ou pagamento, leia [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md) e [docs/SECURITY.md](docs/SECURITY.md).
4. Para trabalho com mais de uma etapa, crie um plano em `docs/exec-plans/active/` usando o modelo de [docs/PLANS.md](docs/PLANS.md).

## Invariantes

- TypeScript estrito; não use `any` nem force tipos de dados externos.
- Valide respostas de rede e armazenamento com Zod na fronteira.
- Dinheiro é inteiro em centavos. Nunca use ponto flutuante para valores.
- O frontend nunca confirma pagamento. Apenas o backend, após consultar webhook/status.
- Nunca exponha segredo, token ou credencial em variável `VITE_*`.
- Não chame InfinitePay diretamente do navegador para criar cobrança real.
- Preserve acessibilidade por teclado, estados de erro/carregamento/vazio e layout móvel.
- Mantenha dependências entre camadas no sentido `domain → api → repository → service → runtime → ui/pages`.

## Verificação obrigatória

Execute `npm run check`. Para mudanças de jornada, execute também `npm run test:e2e`.

## Onde registrar conhecimento

- Decisões duráveis: `docs/design-docs/`
- Contratos externos: `docs/API_CONTRACTS.md`
- Trabalho em curso/concluído: `docs/exec-plans/`
- Dívida conhecida: `docs/exec-plans/tech-debt-tracker.md`
- Saúde dos domínios: `docs/QUALITY_SCORE.md`
