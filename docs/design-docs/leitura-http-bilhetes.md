# Leitura pública da API de bilhetes por HTTP

A origem atual da API de bilhetes oferece HTTP para consultar concursos e cartelas. O backend pode iniciar em modo `live` com essa origem e expor essas consultas, identificando os concursos com `purchaseEnabled: false`.

Enquanto `TICKET_API_BASE_URL` não usar HTTPS, o backend rejeita consulta de CPF/telefone, cadastro de cliente, criação de pedido, criação de checkout e validação de bilhetes. A Home informa que o concurso está disponível apenas para consulta e desabilita a ação de compra. Essa proteção também vale para chamadas diretas à API do backend; o estado do botão não é a barreira de segurança.

Quando houver uma origem HTTPS oficial, o mesmo fluxo live pode habilitar compras sem alterar o contrato da Home. O backend continua responsável por revalidar preço, disponibilidade, pagamento e entrega.
