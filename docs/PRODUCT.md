# Produto

## Objetivo

Permitir que uma pessoa compre uma ou mais bilhetes de um sorteio com poucos passos, escolha os números quando desejar e receba confirmação confiável após pagar por Pix.

## Jornada principal

1. Ver os sorteios ativos de quarta e domingo em um destaque navegável, com prêmio, data, preço unitário e contagem regressiva em tempo real até cada sorteio.
2. Escolher quarta, domingo ou ambos e definir quantidade aleatória ou bilhetes específicos por sorteio.
3. Revisar/remover bilhetes no carrinho.
4. Informar nome completo, CPF e celular.
5. Criar pedido; o backend revalida preço e disponibilidade e reserva os bilhetes.
6. Abrir checkout InfinitePay.
7. Retornar ao site e aguardar o backend confirmar o Pix.
8. Ver número do pedido e comprovante, quando disponível.

## Regras

- Somente bilhetes disponíveis podem ser selecionadas.
- Onde as dezenas de um bilhete aparecem (escolha, carrinho e "Minhas compras"), aparecem as da 1ª chance e, se houver, as da 2ª chance, cada grupo identificado.
- Seleção aleatória não pode repetir bilhete.
- CPF e celular são validados antes do envio, mas o backend valida novamente.
- O total exibido é `quantidade × preço unitário`; o backend recalcula o total.
- Concursos com ID terminado em `000` ou prazo de venda encerrado não aparecem. Se nenhum estiver disponível, a Home mostra o banner e a mensagem "Sem sorteios ativo no momento".
- Se a API de bilhetes oferecer apenas HTTP, a Home pode mostrar concursos e bilhetes para consulta, mas a compra fica desabilitada até haver HTTPS.
- Uma compra de dois sorteios gera um carrinho, um pedido, reservas atômicas e um pagamento; cada bilhete conserva seu concurso e preço.
- Conflito de reserva (`409`) devolve o usuário à seleção com mensagem clara.
- Parâmetros de retorno da InfinitePay não comprovam pagamento; são apenas identificadores.
- Busca de cliente é feita pelo backend em `GET /api/v1/customers/lookup`, somente por CPF; o navegador não chama a API de bilhetes. CPF e celular aparecem primeiro no formulário, e o celular é obrigatório mesmo sem ser critério de busca.
- Os campos de endereço ficam sempre visíveis, são obrigatórios (exceto o complemento) e enviados em maiúsculas. Cliente encontrado vê o endereço do cadastro e pode revisá-lo; se o cadastro não tiver endereço, precisa preenchê-lo. A API de bilhetes não oferece atualização de `pessoa`, então o endereço revisado vale para o pedido e o pagamento, mas o cadastro externo continua com o endereço antigo.
- Compra para terceiro: ao marcar "Estou comprando para outra pessoa", o formulário pede o nome de quem vai concorrer. O cadastro (`pessoa`) continua sendo do comprador; o bilhete recebe o `pessoas_id` do comprador e o nome do terceiro. Sem a opção, o bilhete recebe o nome do comprador.
- "Minhas compras" (`/minhas-compras`) lista os pedidos feitos no site para um CPF com valor, método de pagamento, data, status, bilhetes e dezenas, comprovante e, se pendente, o link para pagar. Pedido pago tem "Compartilhar no WhatsApp", que gera uma imagem por bilhete no formato do bilhete impresso da Sol da Sorte (prêmios, dezenas das duas chances, valores, lote e posição, data da compra e dados do cliente) e abre o menu de compartilhar do aparelho; sem esse menu, as imagens são baixadas. Cada bilhete também tem seu botão. O CPF pode ser digitado no cabeçalho, ao lado do carrinho, ou na própria página, e nunca vai para a URL. A tela de retorno do pagamento leva a essa página. `manual_review` aparece como "Em análise", nunca como pago.
- Surpresinha envia apenas quantidade; o backend atribui e reserva IDs de bilhetes em transação.
- Menores de 18 anos não podem participar.
- Painel `/admin` (somente administradores autenticados): Vendas lista pedidos com busca por nome, telefone, CPF ou código do bilhete, filtros de status e período e exportação CSV. Pedido pendente com reserva ativa pode receber baixa manual (pagamento recebido fora do checkout), que valida os bilhetes como o webhook; pedido "Em análise" pode ser reprocessado se os bilhetes continuarem disponíveis. Pendente ou em análise pode ser cancelado; cancelar pedido em análise não estorna o pagamento. Toda ação exige motivo e fica na auditoria. Pedido expirado não pode ser aprovado. Clientes lista quem já fez pedido no site, agrupado por CPF, com exportação CSV. Dashboard mostra clientes, bilhetes vendidos, faturamento, bilhetes pendentes, alerta de pedidos em análise, próximos sorteios e gráficos. Sorteios edita datas, valor, prêmios, giros e dupla chance dos concursos existentes direto na API de bilhetes (sem criar concurso); mudar valor ou datas pede confirmação. Configurações define o vídeo do YouTube da Home.
- A Home mostra "Assista ao sorteio" quando há vídeo configurado: primeiro a miniatura; o player (`youtube-nocookie.com`) só carrega após o clique.

## Critérios de aceite do MVP

- Funciona em 360 px e desktop, por mouse e teclado.
- Mantém carrinho ao recarregar a página.
- Esvazia o carrinho assim que o pedido é criado e o comprador é enviado ao pagamento; a partir daí o pedido no backend é a fonte da compra. Pedido expirado ou cancelado exige nova escolha de bilhetes.
- Possui estados de carregamento, vazio, erro, aguardando, pago e expirado.
- Nenhum segredo fica no bundle.
- Respostas de API fora do contrato falham de forma segura.
