# Checkout, cadastro de cliente e pagamento

## Objetivo

Completar a jornada de compra para que o navegador consulte clientes e envie a intenção de compra somente ao backend próprio. O backend será a autoridade sobre concurso, preço, disponibilidade, reserva, criação do checkout InfinitePay e confirmação do pagamento.

O fluxo deve suportar escolha manual e surpresinha, impedir reservas locais duplicadas e usar exclusivamente o concurso atual com o estabelecimento `4734`, que representa a regional `57` (`APP SOL DA SORTE ON`).

## Escopo

- Consultar pessoa por CPF ou telefone por meio do backend próprio.
- Preencher dados de pessoa existente no checkout.
- Exigir endereço completo para pessoa ainda não cadastrada.
- Criar pedido com escolha manual ou quantidade aleatória.
- Reservar cartelas de forma transacional no SQLite.
- Criar ou reutilizar link de pagamento no backend.
- Persistir webhooks da InfinitePay de forma idempotente.
- Confirmar pagamento somente após `payment_check` no backend.
- Consultar o status público do pedido no frontend.

Não fazem parte deste trabalho: painel administrativo, estorno automatizado, troca de provedor de banco, autenticação de operadores ou envio de notificações.

## Restrições externas confirmadas

A API de bilhetes publica `GET /concurso/atual`, `GET /pessoa/cpf/{cpf}`, `GET /pessoa/fone/{fone}`, `GET /bilhete/disponiveis`, `GET /bilhete/disponivel/numero`, `POST /pessoa` e `PUT /bilhete/validar`.

`GET /bilhete/disponiveis` recebe somente `concurso_id`, `estabelecimento_id` e `pagina`. A regional não é um parâmetro do endpoint. Portanto:

- `TICKET_ESTABLISHMENT_ID` será validado como o valor literal `4734`;
- `TICKET_REGIONAL_ID` será validado como o valor literal `57` e usado como invariante local e informação de diagnóstico;
- o adaptador externo enviará `concurso_id` e `estabelecimento_id=4734` à API;
- o frontend não poderá fornecer nem substituir esses identificadores.

A resposta real de `GET /concurso/atual` foi observada em 23/09/2026. Na mesma data, `GET /bilhete/disponiveis` retornou HTTP `500` com erro interno relacionado ao parâmetro `P_CONCUR`, mesmo usando o concurso atual e o estabelecimento correto. O adaptador deve tratar essa condição como indisponibilidade externa (`502`), nunca como lista vazia.

## Arquitetura

O fluxo manterá as fronteiras atuais:

```text
React -> API própria Fastify -> SQLite
                            -> API de bilhetes
                            -> InfinitePay
```

Será adicionado o domínio backend `customers`, responsável por consultar e normalizar pessoas da API externa. O domínio `tickets` continuará responsável pelo concurso, disponibilidade e validação final das cartelas. `orders` continuará orquestrando cadastro, reserva, checkout e pagamento por portas tipadas.

No frontend, `CartPage` continuará apenas compondo serviços. Acesso HTTP permanecerá restrito aos repositories. Toda resposta de rede será validada com Zod na fronteira.

## Contrato de consulta de cliente

### Rota

```http
GET /api/v1/customers/lookup?cpf=52998224725
GET /api/v1/customers/lookup?phone=84999855367
```

A requisição deve conter exatamente um dos parâmetros. CPF e telefone serão normalizados para dígitos e validados antes da chamada externa.

### Resposta

```ts
type CustomerLookupResult =
  | {
      found: true
      customer: {
        externalId: string
        name: string
        cpf: string
        phone: string
        address?: Address
      }
    }
  | { found: false }

type Address = {
  zipCode: string
  street: string
  number: string
  complement?: string
  neighborhood: string
  city: string
  state: string
}
```

`404` da API externa será convertido em `{ found: false }`. Falha, timeout ou payload inválido da API externa retornará `502`. Uma falha externa nunca será interpretada como pessoa inexistente.

Os schemas externos aceitarão apenas variações observadas e explicitamente normalizadas, como identificador numérico ou textual. Não haverá coerção irrestrita nem `any`.

## Formulário do checkout

CPF e telefone válidos iniciarão consulta com debounce de aproximadamente 400 ms. Requisições obsoletas serão canceladas ou ignoradas por chave de consulta.

Estados visíveis:

- consultando;
- cliente encontrado;
- cliente não encontrado;
- falha recuperável na consulta.

Quando uma pessoa for encontrada, os campos conhecidos serão preenchidos. Campos obrigatórios ausentes continuarão editáveis. Quando nenhuma pessoa for encontrada, serão exibidos CEP, endereço, número, complemento, bairro, cidade e UF; todos, exceto complemento, serão obrigatórios.

O formulário não coletará e-mail, pois não é requisito desta jornada e o campo é opcional na InfinitePay.

## Contrato de criação do pedido

```ts
type OrderSelection =
  | { mode: 'manual'; cardIds: string[] }
  | { mode: 'random'; quantity: number }

type CreateOrderInput = {
  raffleId: string
  selection: OrderSelection
  customer: {
    name: string
    cpf: string
    phone: string
    address?: Address
  }
}
```

O backend não confiará no resultado de busca enviado pelo navegador. Antes de criar o pedido, consultará novamente CPF e telefone:

- se ambos resolverem para pessoas externas diferentes, retornará `409 CUSTOMER_CONFLICT`;
- se uma pessoa existir, seus identificadores canônicos serão associados ao pedido;
- se nenhuma existir, o endereço completo será obrigatório;
- se a API externa falhar, o pedido não será criado.

A resposta do pedido incluirá as cartelas efetivamente reservadas. Isso permite ao frontend mostrar os números atribuídos à surpresinha sem prever a seleção no navegador.

## Reserva manual

O serviço consultará o concurso atual, recusará `raffleId` divergente e recalculará o preço em centavos. Cada cartela solicitada será conferida na API externa para o concurso atual e o estabelecimento `4734`.

O repository abrirá `BEGIN IMMEDIATE`, expirará reservas pendentes vencidas, verificará conflitos locais e inserirá o pedido e todas as reservas na mesma transação. A chave única continuará sendo `raffleId:ticketId`. Qualquer conflito causará rollback completo e resposta `409 TICKET_RESERVED`.

## Reserva aleatória

O frontend enviará somente a quantidade. O backend buscará cartelas externas disponíveis para o concurso atual e estabelecimento `4734`, removerá cartelas com reserva local ativa e selecionará candidatos sem repetição.

Seleção e inserção ocorrerão sob a mesma transação `BEGIN IMMEDIATE`. O repository continuará tentando candidatos disponíveis até completar a quantidade. Se não houver quantidade suficiente, fará rollback e retornará `409 INSUFFICIENT_TICKETS`.

O SQLite protege concorrência entre processos que usam o mesmo arquivo de banco. A API externa não oferece endpoint de reserva; portanto, uma venda feita por outro sistema após a reserva local ainda pode causar falha na entrega. Pagamento recebido nessa situação deverá resultar em `manual_review`, nunca em sucesso falso.

## Ciclo da reserva

- `pending`: reserva ativa até `expiresAt`.
- `processing`: reserva preservada enquanto ocorre validação externa.
- `manual_review`: reserva preservada para intervenção.
- `paid`: reserva local removida após confirmação externa das cartelas.
- `expired` ou `cancelled`: reserva removida.

Um pagamento confirmado depois da expiração será registrado, mas o pedido irá para `manual_review`, pois as cartelas podem ter sido liberadas.

## Checkout InfinitePay

`POST /api/v1/orders/{id}/checkout` continuará separado da criação do pedido. Assim, falhas temporárias na InfinitePay poderão ser repetidas sem criar novo pedido ou duplicar reservas.

O backend enviará:

- `handle` obtido do ambiente do servidor;
- um item por cartela, com preço inteiro em centavos;
- `order_nsu` igual ao UUID do pedido;
- URLs de redirect e webhook obtidas somente da configuração do servidor;
- nome e telefone do cliente;
- endereço, quando disponível, usando apenas os campos aceitos pela InfinitePay.

O link retornado será validado com Zod e persistido. Chamadas posteriores devolverão o mesmo link enquanto o pedido estiver apto a pagamento.

## Webhook e reconciliação

`POST /api/v1/webhooks/infinitepay` validará o payload, verificará se `order_nsu` existe e persistirá o evento antes de responder. A chave idempotente será a combinação de pedido, `transaction_nsu` e `invoice_slug`, protegida por índice único.

O evento armazenará:

- `transaction_nsu`;
- `invoice_slug`;
- `amount`;
- `paid_amount`;
- `capture_method`;
- `receipt_url`;
- payload validado necessário para auditoria.

O webhook não confirma pagamento. Um worker executará `payment_check` e exigirá:

- pedido e identificadores correspondentes;
- `success=true`;
- `paid=true`;
- `amount` exatamente igual a `totalInCents`.

Somente então o pedido avançará para `processing` e o backend tentará cadastrar a pessoa, caso necessário, e validar as cartelas. Sucesso completo produzirá `paid`. Qualquer pagamento confirmado que não possa ser entregue produzirá `manual_review` com evidência preservada.

O redirect do navegador poderá disparar a mesma reconciliação usando `transaction_nsu` e `slug`, mas nunca atualizará o status diretamente.

## Persistência e migração

Será introduzido versionamento explícito de schema no SQLite. A migração adicionará às ordens os campos necessários para origem do cliente, modo de seleção, `paid_amount` e `capture_method`, além do índice único para eventos de pagamento.

Migrações serão transacionais e incrementais. Bancos existentes serão preservados. JSON persistido continuará sendo validado por Zod ao ser carregado.

## Erros públicos

- `400`: entrada inválida.
- `404`: pedido ou concurso inexistente.
- `409 CUSTOMER_CONFLICT`: CPF e telefone pertencem a pessoas diferentes.
- `409 TICKET_RESERVED`: cartela manual reservada.
- `409 INSUFFICIENT_TICKETS`: quantidade aleatória indisponível.
- `409 ORDER_NOT_PAYABLE`: pedido expirado ou fora do estado permitido.
- `502`: API de bilhetes ou InfinitePay indisponível, inválida ou inconsistente.

Mensagens ao usuário serão em português brasileiro e não revelarão payloads, CPF, telefone ou detalhes internos.

## Segurança e privacidade

- O frontend chamará somente `/api`.
- Nenhuma credencial será exposta em `VITE_*`.
- CPF, telefone e endereço não serão gravados em `localStorage`, logs ou telemetria.
- Preço, estabelecimento, regional, URLs e status de pagamento serão definidos ou validados pelo backend.
- O webhook será idempotente e não será tratado como prova isolada de pagamento.
- Logs usarão `order_nsu` e identificadores técnicos, sem dados pessoais.

## Testes e aceite

Testes unitários e de integração devem cobrir:

- consulta por CPF e telefone;
- `404` externo como não encontrado e `500` externo como `502`;
- endereço obrigatório somente para pessoa nova;
- conflito entre CPF e telefone;
- recálculo do preço no backend;
- reserva manual concorrente;
- duas surpresinhas concorrentes sem cartela repetida;
- quantidade aleatória insuficiente;
- expiração e liberação de reserva;
- criação idempotente do checkout;
- webhook duplicado;
- divergência de valor;
- pagamento após expiração;
- falha de entrega convertida em `manual_review`;
- payload InfinitePay com centavos e endereço.

Testes E2E devem exercitar jornada manual, surpresinha, cliente existente, cliente novo e conflito de reserva em viewport móvel e desktop.

Critérios finais:

- `npm run check` sem falhas;
- `npm run test:e2e` sem falhas;
- contratos, segurança, frontend, backend, confiabilidade e qualidade atualizados;
- plano de execução movido de `active` para `completed` após validação.

## Decisões descartadas

- Chamar InfinitePay ou API de bilhetes no navegador: expõe fronteiras confiáveis e permite adulteração.
- Escolher surpresinha definitivamente no frontend: não garante exclusividade no momento da reserva.
- Confirmar pagamento pelo redirect ou webhook isolado: ambos podem ser repetidos ou adulterados.
- Criar pessoa externa antes do pagamento: gera cadastros para compras abandonadas.
- Unificar criação do pedido e do checkout: piora recuperação de falhas temporárias e pode duplicar pedidos.
