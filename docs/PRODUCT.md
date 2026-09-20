# Produto

## Objetivo

Permitir que uma pessoa compre uma ou mais cartelas de um sorteio com poucos passos, escolha os números quando desejar e receba confirmação confiável após pagar por Pix.

## Jornada principal

1. Ver sorteio ativo, prêmio, data e preço unitário.
2. Escolher uma quantidade aleatória ou selecionar cartelas vendo seus números.
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
- Conflito de reserva (`409`) devolve o usuário à seleção com mensagem clara.
- Parâmetros de retorno da InfinitePay não comprovam pagamento; são apenas identificadores.
- Menores de 18 anos não podem participar.

## Critérios de aceite do MVP

- Funciona em 360 px e desktop, por mouse e teclado.
- Mantém carrinho ao recarregar a página.
- Possui estados de carregamento, vazio, erro, aguardando, pago e expirado.
- Nenhum segredo fica no bundle.
- Respostas de API fora do contrato falham de forma segura.
