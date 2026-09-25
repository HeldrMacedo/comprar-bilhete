
### Prompt Melhorado

**Contexto Geral e Configurações da API:**
Atue como um desenvolvedor Full-Stack TypeScript sênior. Preciso implementar um fluxo completo de checkout e integração de pagamentos no meu projeto.
- Analise a documentação da nossa API atual no Swagger: `http://66.94.99.64:9090/swagger/doc/html#/`.
- O endpoint de "concurso atual" já está funcionando e deve ser utilizado.
- **Regra de Negócio Crucial:** Os bilhetes disponíveis para venda no site **sempre** devem ser filtrados pelo `id_regional = 57` ("APP SOL DA SORTE ON") e `id_estabelecimento = 4734` ("APP SOL DA SORTE ON").

**Objetivo 1: Melhorias no Frontend (`src/pages/CartPage.tsx`)**
1. **Busca de Cliente:** Ao digitar o CPF ou Telefone, o sistema deve fazer uma requisição à API para verificar se o cliente já possui cadastro.
   - Se o cliente existir: Preencha automaticamente os dados na tela.
   - Se o cliente não existir: Exiba formulários adicionais obrigatórios para endereço (CEP, Endereço, Número, Complemento, Bairro, Cidade, UF).
2. **Ação de Finalizar (Continuar para PIX):** Ao clicar no botão, o frontend deve enviar o payload da compra (dados do cliente e IDs das cartelas selecionadas) para o nosso **backend**. 
   - *Atenção:* O frontend **nunca** deve chamar a API da InfinitePay diretamente para criar a cobrança. Apenas o backend fará isso por questões de segurança.

**Objetivo 2: Integração de Pagamento no Backend (InfinitePay)**
1. **Criação do Pedido:** O backend deve receber a requisição do frontend, salvar os dados da compra e os identificadores das cartelas (marcando-as como reservadas/pendentes).
2. **Geração do Link de Pagamento:** O backend deve então fazer um POST para a API da InfinitePay (`https://api.checkout.infinitepay.io/links`) utilizando as credenciais seguras do servidor.
   - *Exemplo de Payload esperado pela InfinitePay:*
     ```json
     {
       "handle": "helder-macedo",
       "items": [
         {
           "quantity": 1,
           "price": 1000, // IMPORTANTE: Valores monetários devem ser sempre inteiros em centavos (ex: R$ 10,00 = 1000)
           "description": "Compra de Bilhetes - Sol da Sorte"
         }
       ],
       "order_nsu": "<id_compra_gerado_no_nosso_banco>",
       "redirect_url": "http://localhost:5173/exemplo",
       "webhook_url": "<URL_PUBLICA_DO_NOSSO_BACKEND_PARA_WEBHOOKS>",
       "customer": {
         "name": "Nome do Cliente",
         "email": "email@cliente.com",
         "phone_number": "+5584999855367"
       },
       "address": {
         "cep": "59062300",
         "street": "Avenida lima e silva",
         "neighborhood": "nazare",
         "number": "129",
         "complement": "teste"
       }
     }
     ```
3. O backend deve retornar ao frontend a `url` de pagamento gerada pela InfinitePay para que o usuário seja redirecionado.

**Objetivo 3: Recebimento do Webhook e Confirmação**
1. Crie ou atualize o endpoint no backend que receberá o Webhook da InfinitePay.
2. O payload recebido será semelhante a este:
   ```json
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
   ```
3. O sistema deve atualizar o status do pedido correspondente (`order_nsu`) no banco de dados e salvar os dados mais importantes da transação (como `transaction_nsu`, `paid_amount` e status atualizado). 
   - *Atenção:* O frontend nunca confirma o pagamento de forma autônoma. Ele deve apenas consultar o status no backend, que por sua vez se baseia no webhook.

**Objetivo 4: Prevenção de Concorrência e Duplicidade (Lock de Bilhetes)**
Implemente um mecanismo seguro no backend para evitar que dois clientes comprem a mesma cartela ao mesmo tempo:
1. **Modo Escolha Manual:** Ao tentar finalizar a compra, valide no banco de dados com lock transacional se as cartelas específicas ainda estão disponíveis. Se alguma já foi vendida ou está reservada por outra sessão ativa, aborte a compra e avise o usuário.
2. **Modo Surpresinha (Aleatório):** O sistema deve buscar no banco de dados apenas as cartelas ativamente disponíveis para o concurso atual, garantir a exclusividade no momento de atrelar ao cliente e impedir atribuições duplicadas.

Por favor, faça um plano de execução antes de alterar os arquivos e siga estritamente os princípios de clean architecture e tipagem forte com TypeScript.

---

### O que mudou e por que:
1. **Desacoplamento de Segurança (Frontend vs Backend):** A documentação do seu projeto proíbe o frontend de chamar a InfinitePay diretamente para não vazar as chaves de API (`Nunca exponha segredo, token ou credencial... Não chame InfinitePay diretamente do navegador`). O prompt agora instrui corretamente o agente a criar uma rota intermediária no backend para fazer isso.
2. **Valores em Centavos:** A regra do seu repositório de que `Dinheiro é inteiro em centavos` foi inserida como comentário direto no payload JSON para evitar que o agente crie bugs de ponto flutuante.
3. **Clareza de Ações:** Os itens foram divididos por Domínio (Frontend, Backend, Webhook, Concorrência), o que ajuda imensamente os agentes de IA a construírem o código em camadas adequadas.