# 0001 — Fronteira de pagamento

Status: aceito.

## Decisão

O frontend solicita ao backend um link de checkout e só aceita o status do pedido devolvido pelo backend. A integração InfinitePay, webhook e reconciliação são responsabilidades do servidor.

## Motivo

Uma aplicação apenas no navegador permitiria alterar preço e itens antes de criar o link. Também não há como receber webhook confiável no browser. Separar a fronteira mantém credenciais e regras de negócio fora do bundle e fornece uma autoridade única para pagamento.
