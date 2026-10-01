# Segurança e privacidade

- Valores, disponibilidade e pagamento são validados pelo backend. O frontend é não confiável.
- O link InfinitePay é criado pelo backend para impedir alteração de preço/itens no navegador.
- A tela de retorno nunca marca um pedido como pago por query string; consulta o backend.
- Webhook deve validar pedido, valor, identificadores e idempotência antes de confirmar.
- CPF e telefone são dados pessoais: colete o mínimo, use TLS, restrinja logs e defina retenção no backend.
- Não use localStorage para CPF, telefone, tokens ou resposta de pagamento. O carrinho guarda apenas IDs/números públicos.
- Defina CSP, `Referrer-Policy`, `Permissions-Policy`, HSTS e `X-Content-Type-Options` no host de produção.
- Variáveis `VITE_*` são públicas. Handle pode ser configuração pública, mas credenciais e controles ficam no backend.
- Não logue payloads de cliente no console ou em telemetria.
- Webhook não é prova suficiente por si só: o backend reconcilia `order_nsu`, transação, slug e valor em `payment_check`.
- "Minhas compras" identifica o comprador só pelo CPF, que não é segredo: a resposta omite dados pessoais, exceto em pedido pago, que traz nome do titular, cidade, telefone e CPF para o comprovante (risco aceito em 30/09/2026, registrado no rastreador de dívida); o CPF trafega no corpo de um `POST` (fora de URL, histórico e logs de acesso) e há limite de 10 consultas por minuto por IP. Em produção atrás de proxy, configure `trustProxy` do Fastify para o limite usar o IP real do cliente.
- CPF/telefone ficam no SQLite do servidor; proteja arquivo, backups e volume de produção com acesso mínimo e retenção definida.
- URLs de redirect/webhook vêm da configuração do servidor, nunca de entrada arbitrária do navegador. A criação de pedido é sempre proxied pelo backend; credenciais InfinitePay não ficam em `VITE_*`.

Incidentes de cartela duplicada ou confirmação incorreta têm severidade alta e exigem bloquear vendas até reconciliação.
