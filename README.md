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

Se `.env.local` estiver configurado com `TICKET_PROVIDER=live` e a origem de bilhetes ainda usar HTTP, o site mostra os concursos e cartelas para consulta. A compra fica indisponível até existir uma origem HTTPS. Para executar a jornada completa com dados de demonstração no PowerShell, use:

```powershell
$env:TICKET_PROVIDER='mock'
npm run dev:full
```

O modo live exige uma origem HTTPS para consultar clientes e concluir pedidos, pois essas ações enviam dados pessoais à API de bilhetes.

Para produção, configure `TICKET_PROVIDER=live`, `PAYMENT_PROVIDER=infinitepay`, `TICKET_ESTABLISHMENT_ID`, `INFINITEPAY_HANDLE`, URLs públicas HTTPS e um volume persistente para o banco. Veja [docs/BACKEND.md](docs/BACKEND.md) e [docs/API_CONTRACTS.md](docs/API_CONTRACTS.md).

Para testar checkout real localmente, crie `.env.local` com `VITE_API_MODE=live`,
`TICKET_PROVIDER=live`, `PAYMENT_PROVIDER=infinitepay`, `INFINITEPAY_HANDLE` e
`PUBLIC_API_URL` apontando para a origem HTTPS pública do backend, sem barra final.
`TICKET_API_BASE_URL` também precisa ser HTTPS para habilitar compras em modo live.
Com HTTP, somente os dados públicos de concursos e cartelas são consultados.
Reinicie Vite e backend após alterar o arquivo. O webhook será enviado a
`PUBLIC_API_URL/api/v1/webhooks/infinitepay`. Mantenha o túnel público ativo
durante o teste; Dev Tunnels não substitui hospedagem de produção. Se
`GET /concurso/atual` não encontrar concurso ativo, o checkout live ficará
indisponível, sem trocar silenciosamente para mock.

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
