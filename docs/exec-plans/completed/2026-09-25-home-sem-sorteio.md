# Home sem sorteio ativo

## Objetivo e aceite

Quando a consulta do concurso atual não retornar um sorteio ou falhar, a Home mantém o banner principal e mostra abaixo dele `Sem sorteios ativo no momento`. Dados específicos do concurso e controles de compra só aparecem quando há sorteio válido.

## Contexto

- Consultados `docs/PRODUCT.md`, `ARCHITECTURE.md`, `docs/FRONTEND.md` e `docs/BACKEND.md`.
- `HomePage` hoje retorna antes do banner nos estados de carregamento e erro.
- O repository recebe erro HTTP ou de contrato como rejeição; a consulta usa TanStack Query.
- Há alterações locais anteriores fora do escopo; preservá-las.

## Etapas

1. Criar teste de regressão para ausência do concurso e falha da API; confirmar falha antes da mudança.
2. Renderizar o banner independentemente do resultado e exibir estado vazio abaixo quando não houver concurso. Manter compra condicionada a sorteio válido.
3. Executar testes direcionados, `npm run check` e `npm run test:e2e`; revisar estados em desktop e mobile.

## Decisões

- Usar o mesmo banner visual da Home. Sem sorteio, ocultar data, prêmio e preço para não apresentar dados inexistentes.
- Mostrar a frase pedida literalmente; a Home foi ajustada no workspace para usar o mesmo aviso quando a API falhar.
- Não substituir automaticamente o provider live por mock.

## Progresso

- 2026-09-25: banner mantido nos estados de erro e ausência de sorteio; mensagem exibida abaixo dele e controles de compra ocultados.

## Validação

- `npm test` com `NODE_OPTIONS=--no-webstorage`: 75 testes passaram, incluindo os estados da Home.
- `npm run test:e2e` fora do sandbox: 8 testes passaram em desktop e mobile, incluindo o estado vazio.
- `npm run build`, lint e validadores de arquitetura e documentação passaram. `npm run check` parou no Prettier global por arquivos preexistentes fora do escopo.
