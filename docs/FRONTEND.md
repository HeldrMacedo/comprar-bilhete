# Frontend

## Stack

React 19, TypeScript estrito, Vite, React Router, TanStack Query, React Hook Form e Zod. CSS global usa tokens no `:root`; não adicione outra biblioteca visual sem uma decisão registrada.

## Convenções

- Componentes e páginas: `PascalCase.tsx`.
- Funções, módulos e pastas de camada: `kebab-case.ts`.
- Consultas remotas ficam em TanStack Query; carrinho local fica no provider e `localStorage` validado.
- O repository é a única camada que chama `requestJson`.
- Busca de cliente usa somente `GET /api/v1/customers/lookup`; o navegador nunca chama a API de bilhetes ou InfinitePay. O carrinho v2 guarda seleção manual pública ou quantidade aleatória, nunca dados pessoais.
- Páginas orquestram componentes e services, mas não fazem `fetch`.
- Campos devem ter `label`, erros com `role="alert"` e foco visível.
- Textos para usuário ficam em português brasileiro.

## Modos de API

`VITE_API_MODE=mock` é determinístico e navegável sem backend. `live` chama apenas o backend próprio em `/api`; nunca chama InfinitePay ou a API de bilhetes diretamente. Mock não pode ser ativado silenciosamente por falha do live; isso esconderia indisponibilidade real.

## Definição de pronto

`npm run check` passa, a jornada afetada foi exercitada em mobile e desktop, e qualquer mudança de regra ou contrato atualizou a documentação correspondente.
