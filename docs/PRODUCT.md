# Produto

## Objetivo

Permitir que uma pessoa compre uma ou mais cartelas de um sorteio com poucos passos, escolha os números quando desejar e receba confirmação confiável após pagar por Pix.

## Jornada principal

1. Ver os sorteios ativos de quarta e domingo em um destaque navegável, com prêmio, data, preço unitário e contagem regressiva em tempo real até cada sorteio.
2. Escolher quarta, domingo ou ambos e definir quantidade aleatória ou cartelas específicas por sorteio.
3. Revisar/remover cartelas no carrinho.
4. Informar nome completo, CPF e celular.
5. Criar pedido; o backend revalida preço e disponibilidade e reserva as cartelas.
6. Abrir checkout InfinitePay.
7. Retornar ao site e aguardar o backend confirmar o Pix.
8. Ver número do pedido e comprovante, quando disponível.

## Regras

- Somente cartelas disponíveis podem ser selecionadas.
- Onde as dezenas de uma cartela aparecem (escolha, carrinho e "Minhas compras"), aparecem as da 1ª chance e, se houver, as da 2ª chance, cada grupo identificado.
- Seleção aleatória não pode repetir cartela.
- CPF e celular são validados antes do envio, mas o backend valida novamente.
- O total exibido é `quantidade × preço unitário`; o backend recalcula o total.
- Concursos com ID terminado em `000` ou prazo de venda encerrado não aparecem. Se nenhum estiver disponível, a Home mostra o banner e a mensagem "Sem sorteios ativo no momento".
- Se a API de bilhetes oferecer apenas HTTP, a Home pode mostrar concursos e cartelas para consulta, mas a compra fica desabilitada até haver HTTPS.
- Uma compra de dois sorteios gera um carrinho, um pedido, reservas atômicas e um pagamento; cada cartela conserva seu concurso e preço.
- Conflito de reserva (`409`) devolve o usuário à seleção com mensagem clara.
- Parâmetros de retorno da InfinitePay não comprovam pagamento; são apenas identificadores.
- Busca de cliente é feita pelo backend em `GET /api/v1/customers/lookup`, somente por CPF; o navegador não chama a API de bilhetes. CPF e celular aparecem primeiro no formulário, e o celular é obrigatório mesmo sem ser critério de busca.
- Os campos de endereço ficam sempre visíveis, são obrigatórios (exceto o complemento) e enviados em maiúsculas. Cliente encontrado vê o endereço do cadastro e pode revisá-lo; se o cadastro não tiver endereço, precisa preenchê-lo. A API de bilhetes não oferece atualização de `pessoa`, então o endereço revisado vale para o pedido e o pagamento, mas o cadastro externo continua com o endereço antigo.
- Compra para terceiro: ao marcar "Estou comprando para outra pessoa", o formulário pede o nome de quem vai concorrer. O cadastro (`pessoa`) continua sendo do comprador; o bilhete recebe o `pessoas_id` do comprador e o nome do terceiro. Sem a opção, o bilhete recebe o nome do comprador.
- "Minhas compras" (`/minhas-compras`) lista os pedidos feitos no site para um CPF com valor, método de pagamento, data, status, cartelas e dezenas, comprovante e, se pendente, o link para pagar. Pedido pago tem "Compartilhar no WhatsApp", que gera uma imagem por cartela no formato do bilhete impresso da Sol da Sorte (prêmios, dezenas das duas chances, valores, lote e posição, data da compra e dados do cliente) e abre o menu de compartilhar do aparelho; sem esse menu, as imagens são baixadas. Cada cartela também tem seu botão. O CPF pode ser digitado no cabeçalho, ao lado do carrinho, ou na própria página, e nunca vai para a URL. A tela de retorno do pagamento leva a essa página. `manual_review` aparece como "Em análise", nunca como pago.
- Surpresinha envia apenas quantidade; o backend atribui e reserva IDs de cartelas em transação.
- Menores de 18 anos não podem participar.

## Critérios de aceite do MVP

- Funciona em 360 px e desktop, por mouse e teclado.
- Mantém carrinho ao recarregar a página.
- Esvazia o carrinho assim que o pedido é criado e o comprador é enviado ao pagamento; a partir daí o pedido no backend é a fonte da compra. Pedido expirado ou cancelado exige nova escolha de cartelas.
- Possui estados de carregamento, vazio, erro, aguardando, pago e expirado.
- Nenhum segredo fica no bundle.
- Respostas de API fora do contrato falham de forma segura.
