# Produto

## Objetivo

Permitir que uma pessoa compre uma ou mais bilhetes de um sorteio com poucos passos, escolha os números quando desejar e receba confirmação confiável após pagar por Pix.

## Jornada principal

1. Ver os sorteios ativos de quarta e domingo em um destaque navegável, com prêmio, data, preço unitário e contagem regressiva em tempo real até cada sorteio.
2. Escolher quarta, domingo ou ambos e definir quantidade aleatória ou bilhetes específicos por sorteio.
3. Revisar/remover bilhetes no carrinho.
4. Entrar ou cadastrar-se (CPF e senha; cadastro novo confirma o e-mail por código).
5. Criar pedido; o backend revalida preço e disponibilidade e reserva os bilhetes.
6. Abrir checkout InfinitePay.
7. Retornar ao site e aguardar o backend confirmar o Pix.
8. Ver número do pedido e comprovante, quando disponível.

## Regras

- Somente bilhetes disponíveis podem ser selecionadas.
- Onde as dezenas de um bilhete aparecem (escolha, carrinho e "Minhas compras"), aparecem as da 1ª chance e, se houver, as da 2ª chance, cada grupo identificado.
- Seleção aleatória não pode repetir bilhete.
- CPF, celular e demais campos do cadastro são validados antes do envio, mas o backend valida novamente.
- O total exibido é `quantidade × preço unitário`; o backend recalcula o total.
- Concursos com ID terminado em `000` ou prazo de venda encerrado não aparecem. Se nenhum estiver disponível, a Home mostra o banner e a mensagem "Sem sorteios ativo no momento".
- O prêmio principal no banner de cada concurso é o último prêmio preenchido, na ordem enviada pela API; sem prêmios, aparece "Prêmios a confirmar".
- Se a API de bilhetes oferecer apenas HTTP, a Home pode mostrar concursos e bilhetes para consulta, mas a compra fica desabilitada até haver HTTPS.
- Uma compra de dois sorteios gera um carrinho, um pedido, reservas atômicas e um pagamento; cada bilhete conserva seu concurso e preço.
- Conflito de reserva (`409`) devolve o usuário à seleção com mensagem clara.
- Parâmetros de retorno da InfinitePay não comprovam pagamento; são apenas identificadores.
- O checkout exige conta. Os dados do comprador vêm da conta; o pedido só informa e-mail e, opcionalmente, o nome do terceiro. Endereço e dados pessoais se editam em Meus dados, que regrava o cadastro na API por `POST /pessoa/cadastro` (contrato ainda não validado contra a API real). Conta sem cadastro completo (nome, CPF, celular, e-mail e endereço) não compra: o backend responde `PROFILE_INCOMPLETE` e o carrinho leva a Meus dados.
- Login (botão **Entrar**, ao lado do carrinho; logado vira **Minha conta**, com Minhas compras, Meus dados e Sair): o CPF define o caminho. Com conta, pede a senha (mínimo de 8 caracteres) e oferece "Esqueci minha senha". CPF já cadastrado na API de bilhetes, sem conta no site, faz o primeiro acesso: um código de 6 dígitos vai para o e-mail gravado na API (mascarado na tela, nunca digitado) e o cliente define a senha. CPF cadastrado na API sem e-mail vê orientação para procurar a lotérica ou o suporte, ou informar um código gerado pelo admin. CPF novo se cadastra com nome, celular, e-mail, endereço completo e senha, depois de confirmar o e-mail por código. O código vale 15 minutos, aceita 5 tentativas e só pode ser reenviado após 60 segundos; o código do admin vale 24 horas. A sessão dura 30 dias sem uso. A tela `/entrar` aceita `?next=` apenas para caminhos internos.
- Compra para terceiro: ao marcar "Estou comprando para outra pessoa", o formulário pede o nome de quem vai concorrer. O cadastro (`pessoa`) continua sendo da conta do comprador; o bilhete recebe o `pessoas_id` do comprador e o nome do terceiro. Sem a opção, o bilhete recebe o nome do comprador.
- "Minhas compras" (`/minhas-compras`) exige sessão e lista os pedidos feitos no site para o CPF da conta (inclusive os anteriores ao login), com valor, método de pagamento, data, status, bilhetes e dezenas, comprovante e, se pendente, o link para pagar. Sem sessão, leva a `/entrar?next=/minhas-compras`. Pedido pago tem "Compartilhar no WhatsApp", que gera uma imagem por bilhete no formato do bilhete impresso da Sol da Sorte (prêmios, dezenas das duas chances, valores, lote e posição, data da compra e dados do cliente) e abre o menu de compartilhar do aparelho; sem esse menu, as imagens são baixadas. Cada bilhete também tem seu botão. O CPF nunca é digitado nem vai para a URL. A tela de retorno do pagamento leva a essa página. `manual_review` aparece como "Em análise", nunca como pago.
- Surpresinha envia apenas quantidade; o backend atribui e reserva IDs de bilhetes em transação.
- Menores de 18 anos não podem participar.
- Painel `/admin` (somente administradores autenticados): Vendas lista pedidos com busca por nome, telefone, CPF ou código do bilhete, filtros de status e período e exportação CSV. Pedido pendente com reserva ativa pode receber baixa manual (pagamento recebido fora do checkout), que valida os bilhetes como o webhook; pedido "Em análise" pode ser reprocessado se os bilhetes continuarem disponíveis. Pendente ou em análise pode ser cancelado; cancelar pedido em análise não estorna o pagamento. Toda ação exige motivo e fica na auditoria. Pedido expirado não pode ser aprovado. Clientes lista quem já fez pedido no site, agrupado por CPF, com exportação CSV e o botão de código de primeiro acesso: para CPF sem e-mail no cadastro, gera um código de 24 horas, mostrado uma única vez, que o admin entrega ao cliente (pessoalmente ou por WhatsApp); CPF com e-mail é recusado e deve usar "Esqueci minha senha". A geração fica na auditoria. Dashboard mostra clientes, bilhetes vendidos, faturamento, bilhetes pendentes, alerta de pedidos em análise, próximos sorteios e gráficos. Sorteios edita datas, valor, prêmios, giros e dupla chance dos concursos existentes direto na API de bilhetes (sem criar concurso); mudar valor ou datas pede confirmação. Configurações define o vídeo do YouTube da Home.
- Pedido pago envia ao cliente um e-mail com a cartela de cada bilhete (1ª e 2ª chance) e o PDF dos bilhetes em anexo. Se o envio falha, o sistema tenta de novo após 1 min, 5 min, 30 min e 2 h; depois disso o e-mail fica como "Falhou". O painel de Vendas mostra o status (Na fila, Enviado, Falhou, Sem e-mail) e permite reenviar, com motivo, o e-mail de pedido pago que tenha e-mail cadastrado e não esteja já na fila.
- A Home mostra "Assista ao sorteio" quando há vídeo configurado: primeiro a miniatura; o player (`youtube-nocookie.com`) só carrega após o clique.

## Critérios de aceite do MVP

- Funciona em 360 px e desktop, por mouse e teclado.
- Mantém carrinho ao recarregar a página (a sessão expirada no checkout não perde o carrinho).
- Esvazia o carrinho assim que o pedido é criado e o comprador é enviado ao pagamento; a partir daí o pedido no backend é a fonte da compra. Pedido expirado ou cancelado exige nova escolha de bilhetes.
- Possui estados de carregamento, vazio, erro, aguardando, pago e expirado.
- Nenhum segredo fica no bundle.
- Respostas de API fora do contrato falham de forma segura.
