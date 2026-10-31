Documentação interativa
Veja como conectar o seu site com a InfinitePay de um jeito simples

Com essa integração, você pode gerar links de pagamento automaticamente e acompanhar as vendas em tempo real. Crie um checkout de pagamento integrado ao seu site ou sistema de forma incrivelmente simples! Nossa API é direta e descomplicada.

Nesta documentação, você entenderá o funcionamento e aprenderá, na prática, a montar seu payload. Ao lado, no menu interativo, você pode gerar um link de pagamento, testando o payload criado por você.

Antes de começar
Alguns pontos importantes que você precisa saber:

Vendedor:
É você, o dono do site de vendas
Comprador:
A pessoa que vai fazer a compra
Handle:
Sua InfiniteTag, que é seu nome de usuário no App InfinitePay (use ela sem o símbolo $ do início)
order_nsu:
É basicamente o número do pedido no seu sistema
Como funciona a integração?
O processo é bem direto: quando alguém faz um pedido no seu site, você envia os dados para a InfinitePay, recebe um link de pagamento e direciona seu cliente para finalizar a compra.

Criando o link de pagamento
Assim que seu cliente fizer um pedido, você vai enviar uma requisição POST para:

Requisição para POST
POST https://api.checkout.infinitepay.io/links
Siga a documentação, que vamos explicar passo a passo como você monta o payload necessário para geração do seu link de checkout.

Informe sua handle
Sua InfiniteTag (nome do usuário no App InfinitePay) é obrigatória para identificar sua conta. Use ela sem o símbolo $ do início.

Exemplo
"handle": "seu-handle"
Handle (Infinite Tag)
helder-macedo
Itens do Pedido
Adicione os produtos ou serviços que o cliente está comprando. É obrigatório ter pelo menos 1 item. Você precisa informar os produtos ou serviços que serão exibidos, utilizando uma lista de objetos no seguinte formato:

Exemplo
"itens": [
{
"quantity": 1,
"price": 123,
"description": "exemplo de descrição"
}
]
Preste atenção ao valor do produto
O valor do produto deve ser colocado em centavos, então R$ 10,00 = 1000 centavos

Itens do Pedido
Descrição *
Produto de Exemplo
Quantidade *
1
Preço *
R$ 10,00
Subtotal: R$ 10.00
Total: R$ 10.00
Order NSU (Opcional)
Order NSU é um identificador que permite rastrear o link de checkout no seu sistema. Se não for informado, a InfinitePay gerará um valor aleatório automaticamente. Utilize este campo para identificar os pagamentos originados deste link de checkout.

Exemplo
"order_nsu": "order-nsu-123"
Quero definir um Order NSU personalizado
URLs de Redirecionamento (Opcional)
Para integrar o checkout ao seu site, você pode definir uma URL de redirecionamento, que será acessada pelo usuário após a conclusão do pagamento (página de sucesso). Você tem a opção de criar uma URL geral ou uma URL específica para cada link. Após o pagamento, seu cliente verá um botão 'Continuar' que o redirecionará para esta URL.

Exemplo
"redirect_url": "https://seusite.com/pagamento-concluido"
Quando seu cliente finalizar o pagamento, ele deve clicar em 'Continuar' para ser redirecionado ao seu site (na redirect_url que você configurou). A URL vai vir com alguns parâmetros importantes:

receipt_url- Link do comprovante de pagamento
order_nsu- O número do pedido no seu sistema
slug- Código da fatura na InfinitePay
capture_method- Como foi pago ("credit_card" ou "pix")
transaction_nsu- ID único da transação
Sem redirect_url configurada, o cliente é redirecionado automaticamente para a URL do comprovante após 3 segundos.

Você pode consultar o status do pagamento fazendo uma requisição:

Requisição para status de pagamento
POST https://api.checkout.infinitepay.io/payment_check
Corpo da requisição:

Exemplo
{
"handle": "sua_infinite_tag",
"order_nsu": "123456",
"transaction_nsu": "UUID-que-recebeu",
"slug": "codigo-da-fatura"
}
Resposta:

Exemplo
{
"success": true,
"paid": true,
"amount": 1500,
"paid_amount": 1510,
"installments": 1,
"capture_method": "pix"
}
Incluir URL de redirecionamento
Webhook URL (Opcional)
Para uma integração ainda mais robusta, você pode configurar uma webhook_url. Quando o pagamento for aprovado, a InfinitePay enviará automaticamente os dados da venda para o seu sistema por meio dessa URL. Isso garante que você seja notificado em tempo real sobre o status do pagamento, sem precisar consultar manualmente. A webhook_url deve ser uma URL válida e acessível publicamente (por exemplo, não utilize http://www.webhook.com).

Exemplo
"webhook_url": "https://seusite.com/webhook-infinitepay"
Como responder ao webhook
Responda rapidamente (de preferência em menos de 1 segundo) com um desses códigos:

Tudo certo
Status: 200 OK
Algo deu errado
Status: 400 Bad Request
Dica: Se você responder com erro 400, a gente tenta enviar novamente!
O corpo da mensagem que você receberá no webhook, quando o pagamento for aprovado, terá o seguinte formato:

Exemplo
{
"invoice_slug": "abc123",
"amount": 1000,
"paid_amount": 1010,
"installments": 1,
"capture_method": "credit_card",
"transaction_nsu": "UUID",
"order_nsu": "UUID-do-pedido",
"receipt_url": "https://comprovante.com/123",
"items": [...]
}
Incluir URL do webhook
Dados do Cliente (Opcional)
Se você já tiver o nome, e-mail e telefone do comprador, pode enviá-los para agilizar o processo. Isso facilitará o checkout, pois as informações já estarão preenchidas.

Exemplo
"customer": {
"name": "João Silva",
"email": "joao@email.com",
"phone_number": "+5511999887766"
}
Incluir dados do cliente
Nome
Helder Macedo
Email
maria@email.com
Telefone
+5584999855367
Endereço de Entrega (Opcional)
Se o seu produto precisa ser entregue em mãos, você pode incluir o endereço.

Exemplo
"address": {
"cep": "12345678",
"street": "Rua das Flores",
"neighborhood": "Centro",
"number": "123",
"complement": "Apto 45"
}
Incluir endereço de entrega
Opções avançadas (com API Key)
Personalize cada link com as opções abaixo, sem mudar as configurações da sua conta. Para usá-las na sua integração, você precisa de uma API Key.

Como usar na sua integração
Acesse as configurações do Checkout e ative o Checkout Integrado.
Na mesma página, crie sua API Key e escolha um nome para ela, como minha-loja.
Copie e guarde sua chave: ela aparece apenas uma vez. Não compartilhe com seus clientes nem coloque no código do seu site.
Na sua integração, envie a chave pelo seu servidor no header X-Api-Key. Com ela, você não precisa informar sua InfiniteTag.
Para experimentar aqui, escolha as opções e clique em Testar API. O botão cria um link real na sua conta, sem precisar informar uma chave.

Veja um exemplo
Veja um exemplo
{
"options": {
"assured_installments": 3,
"require_delivery_address": true,
"single_payment": true,
"valid_until": "2026-11-25T23:38:15.670Z",
"payment_methods_enabled": [
"credit_card",
"pix"
],
"discounts": {
"pix": 5,
"credit_card": 2.5
}
}
}
Assumir parcelas
Escolha em quantas parcelas você paga as taxas pelo cliente, de 0 a 12. Por exemplo, com 3, ele pode pagar em até 3x sem essas taxas. Use 0 para repassar as taxas em todas as parcelas.

Exemplo
{
"assured_installments": 3
}
Personalizar: Assumir parcelas
Pedir endereço de entrega
Peça o endereço de entrega do cliente na hora do pagamento.

Exemplo
{
"require_delivery_address": true
}
Personalizar: Pedir endereço de entrega
Pagamento único
Permita apenas um pagamento por link. Depois de pago, ele não pode ser usado novamente.

Exemplo
{
"single_payment": true
}
Personalizar: Pagamento único
Ativar: Pagamento único: Sim
Validade
Escolha até quando o link pode ser pago. A data deve estar no futuro, dentro de um ano.

Exemplo
{
"valid_until": "2026-11-25T23:38:15.670Z"
}
Personalizar: Validade
Validade

10/26/2026, 11:59 PM
Formas de pagamento
O cartão de crédito fica sempre disponível. Escolha se o link também aceita Pix.

Exemplo
{
"payment_methods_enabled": [
"credit_card",
"pix"
]
}
Personalizar: Formas de pagamento
cartão de crédito
Pix
Descontos
Ofereça um desconto para quem pagar com Pix ou cartão de crédito. Informe uma porcentagem maior que 0 e menor que 100. Deixe vazio para não incluir desconto naquela forma de pagamento.

Exemplo
{
"discounts": {
"pix": 5,
"credit_card": 2.5
}
}
Personalizar: Descontos
Dicas práticas
•
Webhook é mais eficiente que ficar consultando manualmente
•
Sempre valide se o order_nsu corresponde a um pedido real no seu sistema
•
Guarde o transaction_nsu pra futuras consultas
•
Teste bastante no ambiente de desenvolvimento antes de colocar no ar
