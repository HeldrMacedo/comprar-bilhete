# Produto

## Objetivo

Permitir que uma pessoa compre uma ou mais cartelas de um sorteio com poucos passos, escolha os números quando desejar e receba confirmação confiável após pagar por Pix.

## Jornada principal

1. Ver os sorteios ativos de quarta e domingo, prêmio, data e preço unitário de cada um.
2. Escolher quarta, domingo ou ambos e definir quantidade aleatória ou cartelas específicas por sorteio.
3. Revisar/remover cartelas no carrinho.
4. Informar nome completo, CPF e celular.
5. Criar pedido; o backend revalida preço e disponibilidade e reserva as cartelas.
6. Abrir checkout InfinitePay.
7. Retornar ao site e aguardar o backend confirmar o Pix.
8. Ver número do pedido e comprovante, quando disponível.

## Regras

- Somente cartelas disponíveis podem ser selecionadas.
- Seleção aleatória não pode repetir cartela.
- CPF e celular são validados antes do envio, mas o backend valida novamente.
- O total exibido é `quantidade × preço unitário`; o backend recalcula o total.
- Concursos com ID terminado em `000` ou prazo de venda encerrado não aparecem. Se nenhum estiver disponível, a Home mostra o banner e a mensagem "Sem sorteios ativo no momento".
- Se a API de bilhetes oferecer apenas HTTP, a Home pode mostrar concursos e cartelas para consulta, mas a compra fica desabilitada até haver HTTPS.
- Uma compra de dois sorteios gera um carrinho, um pedido, reservas atômicas e um pagamento; cada cartela conserva seu concurso e preço.
- Conflito de reserva (`409`) devolve o usuário à seleção com mensagem clara.
- Parâmetros de retorno da InfinitePay não comprovam pagamento; são apenas identificadores.
- Busca de cliente é feita pelo backend em `GET /api/v1/customers/lookup`; o navegador não chama a API de bilhetes.
- Surpresinha envia apenas quantidade; o backend atribui e reserva IDs de cartelas em transação.
- Menores de 18 anos não podem participar.

## Critérios de aceite do MVP

- Funciona em 360 px e desktop, por mouse e teclado.
- Mantém carrinho ao recarregar a página.
- Possui estados de carregamento, vazio, erro, aguardando, pago e expirado.
- Nenhum segredo fica no bundle.
- Respostas de API fora do contrato falham de forma segura.
