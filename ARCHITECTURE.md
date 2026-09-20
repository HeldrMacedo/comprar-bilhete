# Arquitetura

## Visão geral

Aplicação full-stack no mesmo repositório. O React possui três domínios: `raffle` apresenta o sorteio e seleciona cartelas; `cart` mantém a seleção local; `checkout` conversa somente com o backend próprio. O servidor Fastify persiste pedidos, integra InfinitePay e encapsula a API externa de bilhetes.

```text
React → Backend Fastify → SQLite
                    ├── API externa de bilhetes
                    └── InfinitePay
```

O backend é a autoridade sobre disponibilidade, preço, reserva, pedido e pagamento. O estado do carrinho no navegador é apenas uma intenção de compra.

## Backend

```text
server/
├── config/              ambiente validado
├── domains/
│   ├── orders/          pedido, reserva, persistência e orquestração
│   ├── payments/        porta + providers mock/InfinitePay
│   └── tickets/         porta + providers mock/API externa
├── http/                rotas e presenters
└── shared/              SQLite, HTTP externo e erros
```

Providers permitem testar toda a jornada sem efeitos externos. Em live, o pagamento é reconciliado antes da venda e falhas de entrega entram em `manual_review`.

## Estrutura

```text
src/
├── app/                 composição, layout e estilos globais
├── features/
│   ├── raffle/          domain → api → repository → service → ui
│   ├── cart/            domain → runtime
│   └── checkout/        domain → api → repository → service
├── pages/               composição de jornadas; sem acesso HTTP direto
└── shared/              config, cliente HTTP, utilitários e UI genérica
```

As páginas podem compor features. Features não importam páginas ou `app`. `domain` não importa outra camada da própria feature; cada camada pode depender somente das camadas à sua esquerda no mapa. Dados entram pelo repository, passam por schema e são expostos como tipos do domínio.

## Fluxo de compra

```text
Sorteio ativo → aleatória ou manual → carrinho → identificação
→ backend reserva/cria pedido → backend cria link InfinitePay
→ checkout hospedado → retorno → polling do pedido
→ backend confirma pagamento → sucesso
```

Veja contratos e estados em [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md) e confiabilidade em [docs/RELIABILITY.md](docs/RELIABILITY.md).
