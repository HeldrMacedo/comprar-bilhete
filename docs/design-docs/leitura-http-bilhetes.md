# Leitura pública da API de bilhetes por HTTP

A origem atual da API de bilhetes oferece HTTP para consultar concursos e cartelas. O backend pode iniciar em modo `live` com essa origem e expor essas consultas, identificando os concursos com `purchaseEnabled: false`.

Enquanto `TICKET_API_BASE_URL` não usar HTTPS, o backend rejeita consulta de CPF/telefone, cadastro de cliente, criação de pedido, criação de checkout e validação de bilhetes. A Home informa que o concurso está disponível apenas para consulta e desabilita a ação de compra. Essa proteção também vale para chamadas diretas à API do backend; o estado do botão não é a barreira de segurança.

Quando houver uma origem HTTPS oficial, o mesmo fluxo live pode habilitar compras sem alterar o contrato da Home. O backend continua responsável por revalidar preço, disponibilidade, pagamento e entrega.

## Exceção explícita: compra por HTTP

Em 25/09/2026 a origem `http://66.94.99.64:9090` continua sem HTTPS, e o responsável pelo produto decidiu aceitar compras por ela. A exceção é opt-in: `TICKET_API_ALLOW_HTTP=true` libera consulta de cliente, pedido, checkout e validação de bilhetes pela origem HTTP; o valor padrão `false` mantém o bloqueio descrito acima. O backend registra aviso no startup enquanto a exceção estiver ativa com origem HTTP.

Risco aceito: CPF, telefone e endereço trafegam sem criptografia entre o backend e a API de bilhetes e podem ser lidos ou alterados no caminho. Navegador e InfinitePay não são afetados. A exceção deve ser removida assim que houver origem HTTPS oficial.
