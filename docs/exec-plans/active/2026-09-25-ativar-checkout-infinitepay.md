# Ativar checkout InfinitePay no ambiente local

## Objetivo e aceite

Integrar a implementação da branch `feature/checkout-payment` em `main`, preservar as alterações locais do usuário e fazer o navegador usar o backend, que cria o link InfinitePay. A configuração local deve usar o handle confirmado `helder-macedo`, estabelecimento `4734`, regional `57` e o túnel HTTPS informado. Nenhum teste deve criar cobrança real.

Aceite: o frontend não gera `order_nsu=demo-*` em modo live; o backend seleciona providers live; o payload de criação de link usa o webhook público; testes automatizados e `npm run check` são executados; a jornada E2E é tentada sem contato com InfinitePay real.

## Contexto e contratos

- `docs/PRODUCT.md`, `ARCHITECTURE.md`, `docs/FRONTEND.md`, `docs/BACKEND.md`, `docs/API_CONTRACTS.md` e `docs/SECURITY.md`.
- `main` está antes dos commits de checkout. Sem `.env` ou `.env.local`, o frontend e os providers do backend usam mock por padrão.
- O usuário alterou `server/config/env.ts` e `server/domains/payments/infinitepay-gateway.ts` para usar `WEBHOOK_URL`; essas alterações devem ser preservadas ou substituídas por configuração equivalente, sem perdê-las.
- `PUBLIC_API_URL` é a origem pública usada pelo backend para construir `/api/v1/webhooks/infinitepay`. A URL do túnel não deve ficar fixa no código-fonte.

## Etapas

1. Registrar estado do Git; guardar somente as duas alterações conflitantes em stash recuperável. Integrar a branch por fast-forward, sem tocar `package-lock.json` nem `prompt.md`. Reaplicar e conciliar o stash.
2. Teste vermelho: verificar que `InfinitePayGateway` usa origem pública configurada e URL completa do webhook. Corrigir código e passar teste sem chamada externa real.
3. Criar `.env.local` ignorado pelo Git com frontend/backend live, handle e túnel. Manter filtros `4734`/`57` e redirecionamento local. Reinício dos processos Vite/servidor será necessário para ler as variáveis.
4. Executar testes unitários, `npm run check` e `npm run test:e2e` sem usar provider real nos testes. Verificar saúde local/pública e rotas read-only. Registrar limitações.

## Decisões

- O túnel é somente para desenvolvimento; não é endpoint de produção.
- `WEBHOOK_URL` hardcoded não será fonte de configuração. O valor do usuário será mantido em `.env.local` por `PUBLIC_API_URL`, evitando duas origens públicas divergentes.
- Não fazer POST de compra nem de webhook real durante a verificação. Isso evita cobrança, reserva ou confirmação indevida.

## Progresso

- 2026-09-25: diagnóstico e autorização do usuário registrados. Implementação em curso.
- 2026-09-25: `main` avançou por fast-forward até `d0be395`; alterações locais de webhook foram guardadas em `stash@{0}`, reaplicadas e conciliadas. `package-lock.json` e `prompt.md` não foram alterados.
- 2026-09-25: `.env.local` em `main` e na worktree do processo em execução usam frontend/backend live, handle confirmado e túnel HTTPS. O código usa `PUBLIC_API_URL`, não URL hardcoded.
- 2026-09-25: processo antigo da worktree ainda atende a porta 3333 em mock; não reiniciar com a configuração live insegura enquanto faltar origem HTTPS oficial. A API externa responde `404` para `/concurso/atual`.
- 2026-09-25: revisão apontou risco de E2E reutilizar backend live; configuração padrão agora usa portas 3334/4173 sem reutilização. API de bilhetes em HTTP não atende à regra de TLS para dados pessoais; modo live agora falha no startup até receber origem HTTPS oficial.

## Validação

- Teste `InfinitePayGateway` vermelho antes da correção: webhook ignorava `PUBLIC_API_URL`; verde depois (3/3).
- `npm test` com Node 22: 57/57 testes passaram. Node 25 falha em testes jsdom por `localStorage` do runtime.
- `npm run lint`, `npm run validate:architecture`, `npm run validate:docs` e `npm run build`: passaram.
- `npm run check`: falha na etapa `prettier --check .` por arquivos preexistentes fora do escopo, inclusive outras worktrees. Arquivos alterados foram formatados individualmente.
- `npm run test:e2e` original: porta 3333 ocupada. Configuração padrão foi corrigida para isolar 3334/4173 e nunca reutilizar servidores. Com Chrome local no lugar do navegador empacotado ausente, a configuração padrão corrigida passou 4/4 via wrapper local.
- Teste E2E de regressão: forçar frontend mock produziu `order_nsu=demo-*` e falhou; em live, 4/4 passaram com IDs UUID do backend. Teste de isolamento E2E e teste de TLS passaram após falhar antes da correção.
- `GET http://66.94.99.64:9090/concurso/atual`: `404`, `Nenhum concurso ativo encontrado`. Nenhuma cobrança real criada.
- `https://66.94.99.64:9090/swagger/doc/json`: sem resposta TLS. Ativação real pendente de URL HTTPS oficial e concurso ativo; `.env.local` live é rejeitado no startup até lá.
