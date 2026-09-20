# Comprar Bilhete

Aplicação full-stack para escolher cartelas de sorteio, criar pedidos e pagar no checkout Pix da InfinitePay. O React conversa somente com o backend Fastify deste repositório; o servidor persiste pedidos em SQLite e encapsula InfinitePay e a API externa de bilhetes.

## Começar

Requer Node.js 22+ e npm 10+.

```bash
cp .env.example .env
npm install
npm run dev:full
```

O arquivo de exemplo executa o frontend em modo live contra o backend local, enquanto os providers externos permanecem em mock. Assim, toda a jornada full-stack funciona sem pagamento nem venda real.

```dotenv
TICKET_PROVIDER=mock
PAYMENT_PROVIDER=mock
```

Para produção, configure `TICKET_PROVIDER=live`, `PAYMENT_PROVIDER=infinitepay`, `TICKET_ESTABLISHMENT_ID`, `INFINITEPAY_HANDLE`, URLs públicas HTTPS e um volume persistente para o banco. Veja [docs/BACKEND.md](docs/BACKEND.md) e [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md).

## Comandos

| Comando              | Finalidade                                       |
| -------------------- | ------------------------------------------------ |
| `npm run dev:full`   | frontend e backend local                         |
| `npm run dev`        | somente o frontend                               |
| `npm run dev:server` | somente o backend                                |
| `npm test`           | testes unitários                                 |
| `npm run test:e2e`   | jornada crítica no navegador                     |
| `npm run check`      | lint, formato, arquitetura, docs, testes e build |
| `npm run build`      | bundle de produção                               |

Comece por [AGENTS.md](AGENTS.md) para o mapa do repositório e por [docs/PRODUCT.md](docs/PRODUCT.md) para as regras de produto.
