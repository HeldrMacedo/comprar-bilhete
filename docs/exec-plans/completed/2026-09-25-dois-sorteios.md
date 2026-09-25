# Escolha entre os sorteios da semana

## Objetivo e critérios de aceite

Permitir participação no sorteio de domingo, no de quarta ou nos dois, sem mostrar concursos cujo ID termina em `000`. A interface deve mostrar apenas sorteios válidos e manter estados de carregamento, vazio e erro. Valores e disponibilidade devem ser recalculados no backend antes de criar qualquer cobrança.

## Contexto e contratos consultados

- `docs/PRODUCT.md`, `ARCHITECTURE.md`, `docs/FRONTEND.md`, `docs/BACKEND.md`, `docs/API_CONTRACTS.md` e `docs/SECURITY.md`.
- `GET /concurso/atual` retorna campos `sorteiocap` e `sorteioesp` no mesmo objeto. Amostra de 25/09/2026: CAP com data 27/09 (domingo), ESP com data 23/09 (quarta, prazo encerrado). O usuário confirmou que o dia deve vir da data do sorteio.
- Consultas de bilhetes para os IDs da amostra responderam `count: 0` no estabelecimento `4734`.
- O contrato atual usa um sorteio por carrinho, pedido, reserva e checkout; seleção conjunta exige migração de contrato e persistência.
- Há alterações locais anteriores em andamento, inclusive na Home; preservá-las.

## Etapas

1. Normalizar os dois concursos externos, validar campos e descartar IDs terminados em `000`; testar o parser com resposta real e sentinelas.
2. Identificar domingo/quarta pela data do sorteio e excluir concursos cujo `data_fim` e horário já passaram.
3. Estender contrato de leitura para listar sorteios, incluindo mock e estados sem cartelas.
4. Estender carrinho e pedido para seleções por sorteio, reservas atômicas, preços por item, checkout e entrega por concurso; migrar armazenamento com segurança.
5. Atualizar Home, carrinho, pagamento, contratos e testes. Executar `npm run check` e `npm run test:e2e`.

## Decisões e alternativas

- Manter o backend como autoridade sobre preço, sorteio ativo, disponibilidade e pagamento.
- Não usar HTTP da API externa para dados pessoais: a configuração live continua exigindo HTTPS.
- Compra conjunta usa um carrinho, um pedido e um pagamento; cada sorteio mantém sua própria escolha de cartelas ou quantidade.
- O dia é derivado de `data_sorteiocap`/`data_sorteioesp`, sem associar CAP ou ESP a um dia fixo.
- Concursos com ID `000` ou prazo de venda encerrado por data e horário são ocultados.

## Progresso

- 2026-09-25: contrato externo consultado e perguntas de comportamento enviadas.
- 2026-09-25: parser dos dois blocos criado; IDs terminados em `000` são ignorados antes de validar campos de concurso. `LiveTicketGateway.getActiveRaffles()` consulta e normaliza a resposta. A rota antiga agora usa o primeiro concurso válido e retorna 404 se não houver nenhum. Testes de parser e gateway: 10/10 passaram.
- 2026-09-25: usuário confirmou classificação pelo calendário, corte pelo prazo completo e checkout único com seleções por sorteio.
- 2026-09-25: frontend, pedido, reservas e checkout foram estendidos para duas seleções. Cada cartela retém o concurso e o preço de origem. Carrinho anterior é migrado na leitura.
- 2026-09-25: parser passou a ignorar campos incompletos de um bloco expirado sem esconder o bloco válido. Contratos de API e produto foram atualizados.

## Validação

- `npm test` com `NODE_OPTIONS=--no-webstorage`: 75 testes passaram.
- `npm run lint`, `npm run build`, `npm run validate:architecture` e `npm run validate:docs`: passaram.
- `npm run check`: executado; parou no Prettier global por arquivos preexistentes fora do escopo, inclusive `.kilo/worktrees/`.
- `npm run test:e2e` fora do sandbox: 8 testes passaram em desktop e mobile, inclusive compra conjunta e estado vazio.
- A API externa disponível usa HTTP. A validação de segurança mantém `TICKET_PROVIDER=live` bloqueado até existir origem HTTPS para o envio de dados pessoais.
