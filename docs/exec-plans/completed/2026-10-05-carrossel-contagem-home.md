# Carrossel e contagem regressiva dos concursos na Home

## Objetivo e aceite

Mostrar um slide por concurso ativo no destaque da Home, com navegação por teclado e mouse e contagem regressiva atualizada a cada segundo até o horário de início de cada sorteio. O estado sem concursos permanece legível. O layout funciona em 360 px e desktop.

## Contexto e contratos

- `docs/PRODUCT.md`, `ARCHITECTURE.md`, `docs/FRONTEND.md`, `docs/BACKEND.md`, `docs/API_CONTRACTS.md` e `docs/SECURITY.md` consultados.
- A Home já consome `GET /api/v1/raffles/active`; `drawDate` é ISO com fuso normalizado no backend a partir de `data_sorteio*` e `hora_sorteio*` de `/concurso/atual`.
- Em 05/10/2026, `/concurso/atual` retornou CAP `2026042` para 07/10/2026 às 20:00 e ESP `2026043` para 11/10/2026 às 09:00, horários de Fortaleza.
- Há mudanças locais em andamento na Home e nos estilos; elas devem ser preservadas.

## Etapas

1. Implementar destaque com um slide por concurso, controles acessíveis e contagem regressiva por horário de sorteio.
2. Ajustar layout móvel e cobrir navegação e passagem do tempo com testes úteis.
3. Executar `npm run check` e `npm run test:e2e`; registrar resultados e mover este plano para `completed/`.

## Decisões

- Usar `drawDate` da API interna em vez de consultar a origem HTTP no navegador. O backend já valida e normaliza o dado.
- Controles manuais evitam mudança inesperada de slide enquanto a pessoa escolhe bilhetes. A contagem é recalculada a cada segundo com o relógio atual, sem subtrair um segundo de estado acumulado.

## Progresso e validação

- 05/10/2026: destaque, controles, contagem regressiva, estilos móveis e testes implementados.
- Testes focados da Home e contagem: 6 passaram. `npm run build`, lint, formatação, validação de arquitetura e documentação passaram.
- `npm run test:e2e`: 15 passaram, 1 ignorado, em desktop e mobile. A primeira execução na sandbox falhou ao criar o pipe local do servidor (`EPERM`); a execução autorizada fora da sandbox passou.
- `npm run check`: falhou em teste preexistente de `server/domains/payments/infinitepay-gateway.test.ts`, pois a alteração local de `webhook_url` usa uma URL fixa de devtunnels em vez de `PUBLIC_API_URL`. Os arquivos desse gateway não foram alterados por este plano.
