# CEP e e-mail opcionais no cadastro, com busca de endereço pelo CEP

## Objetivo e critérios de aceite

- No cadastro novo e em Meus dados, CEP e e-mail deixam de ser obrigatórios. Rua, número, bairro, cidade e UF continuam obrigatórios.
- CEP digitado completo preenche rua, bairro, cidade e UF pela BrasilAPI; os campos continuam editáveis. CEP não encontrado ou BrasilAPI fora do ar só mostram aviso e não bloqueiam o cadastro.
- Conta sem e-mail mantém as regras atuais do CPF sem e-mail (recuperação só pelo código do admin; etapa "Cadastro sem e-mail" continua exigindo e-mail). Decisão do cliente em 26/10/2026.
- Conta sem e-mail ou sem CEP conta como cadastro completo para comprar.

## Contexto consultado

- Swagger da API de bilhetes (`/swagger/doc/json`): o corpo de `POST /pessoa/cadastro` é declarado como `string`, sem lista de campos obrigatórios.
- Teste controlado em 26/10/2026 com CPF de teste sem cadastro (autorizado pelo cliente): `POST /pessoa/cadastro` sem `cep` e com `email: ""` respondeu `201`; a releitura em `GET /pessoa/cpf/{cpf}` devolveu `cep: ""` e `email: ""`. O CPF de teste ficou cadastrado na API (`pessoas_id` 30237). O CPF com cadastro existente só foi consultado, sem escrita.
- BrasilAPI CEP v2 (`/api/cep/v2/{cep}`): `200` com `cep`, `state`, `city`, `neighborhood`, `street`; `404` (`CepPromiseError`) para CEP inexistente.

## Decisões

- O navegador consulta o CEP pelo backend (`GET /api/v1/zip-codes/{cep}`), não direto na BrasilAPI, para manter o frontend falando só com `/api` e validar a resposta com Zod. Provider `mock`/`brasilapi` por `ZIP_CODE_PROVIDER` (padrão `mock`, como os demais providers).
- Limite por IP de `ZIP_CODE_LIMIT_PER_MINUTE` (padrão 30) e `Cache-Control` público de um dia na resposta.
- InfinitePay: endereço sem CEP não é enviado no link de pagamento (o campo `address` é opcional lá e o CEP identifica o endereço).
- O carrinho continua pedindo e-mail em cada pedido; mudar isso não fez parte do pedido.

## Progresso

- 26/10/2026: teste na API real, backend (schemas, rota de CEP, gateways), frontend (formulários, preenchimento pelo CEP, máscara `00000-000`), testes unitários e E2E, documentação.

## Validação

- `npm run check` e `npm run test:e2e` (resultado no fim da entrega).
