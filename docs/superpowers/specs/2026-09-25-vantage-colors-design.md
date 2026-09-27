# Especificação de Design: Adaptação Visual às Cores do Layout Vantage

## 1. Visão Geral e Objetivo

Atualizar a identidade visual e o tema de cores do sistema `comprar-bilhete` para adotar a paleta moderna, limpa e premium do layout de referência (dashboard Vantage):

- Fundo em cinza azulado suave (`#f4f6fa`).
- Superfícies e cards em branco puro (`#ffffff`) com bordas suaves (`#e2e8f0`) e sombras leves.
- Cor primária em azul elétrico vibrante (`#0062ff`), substituindo o tom verde-limão e verde-escuro anterior.
- Hero em azul noturno profundo (`#0f172a`) com detalhes em azul elétrico e ciano (`#00c2ff`).
- Suporte a tons de verde esmeralda (`#10b981`) para status de sucesso/pago, e tons neutros de ardósia para tipografia.

## 2. Paleta de Cores e Tokens CSS (`:root` em `src/app/styles.css`)

| Token             | Novo Valor                                                                        | Descrição                                            |
| ----------------- | --------------------------------------------------------------------------------- | ---------------------------------------------------- |
| `background`      | `#f4f6fa`                                                                         | Fundo principal da página (canvas suave estilo SaaS) |
| `color`           | `#0f172a`                                                                         | Cor padrão de texto (ardósia escuro)                 |
| `--ink`           | `#0f172a`                                                                         | Texto de alto contraste e superfícies escuras        |
| `--muted`         | `#64748b`                                                                         | Texto secundário e legendas                          |
| `--paper`         | `#ffffff`                                                                         | Superfícies, cards e cabeçalho                       |
| `--line`          | `#e2e8f0`                                                                         | Linhas divisórias e bordas sutis                     |
| `--primary`       | `#0062ff`                                                                         | Azul elétrico vibrante do layout Vantage             |
| `--primary-hover` | `#0052cc`                                                                         | Hover para ações primárias                           |
| `--primary-light` | `#eff6ff`                                                                         | Fundo suave de seleção ativa e tags azuis            |
| `--cyan`          | `#00c2ff`                                                                         | Ciano para badges, acentos e brilhos                 |
| `--green`         | `#10b981`                                                                         | Verde esmeralda para confirmação/sucesso             |
| `--green-light`   | `#ecfdf5`                                                                         | Fundo de badges de sucesso                           |
| `--red`           | `#ef4444`                                                                         | Coral/vermelho para erros e ações destrutivas        |
| `--shadow`        | `0 10px 25px -5px rgba(15, 23, 42, 0.06), 0 8px 10px -6px rgba(15, 23, 42, 0.04)` | Sombra moderna suave                                 |

## 3. Aplicação nos Componentes

### 3.1. Cabeçalho e Marca (`.site-header`, `.brand`, `.cart-link`)

- Fundo branco puro (`#ffffff`) com linha inferior suave `#e2e8f0`.
- Ícone da marca (`.brand__mark`): Fundo azul elétrico `#0062ff` com ícone branco e cantos arredondados.
- Contador do carrinho (`.cart-link__count`): Pílula em azul elétrico `#0062ff` com texto branco puro.
- Foco de acessibilidade: `outline: 3px solid rgba(0, 98, 255, 0.6)`.

### 3.2. Banner Hero (`.hero`)

- Fundo: Azul noturno elegante `#0f172a`.
- Anéis decorativos e detalhes: Tons de azul elétrico e ciano (`rgba(0, 98, 255, 0.15)` e `rgba(0, 194, 255, 0.12)`).
- Eyebrow: Ponto luminoso e texto em ciano `#00c2ff`.
- Card de prêmio (`.prize-card`): Fundo com efeito de vidro sofisticado, borda clara e sombra com realce em azul elétrico (`16px 18px 0 -8px #0062ff`), valor em destaque e texto auxiliar em ciano suave `#7dd3fc`.

### 3.3. Escolha de Sorteios e Seleção de Cartelas

- Opções de sorteio (`.raffle-choice`): Cards brancos com borda `#e2e8f0`; quando selecionados, borda `#0062ff` e leve sombra azul.
- Abas de modo (`.mode-tabs button`):
  - Inativo: Fundo `#ffffff`, borda `#e2e8f0`, texto `#64748b`.
  - Ativo (`.active`): Fundo azul elétrico `#0062ff`, texto branco `#ffffff` (espelhando a aba "Overview" do Vantage).
- Pílulas de quantidade rápida (`.quick-quantities button`): Borda `#e2e8f0`, ativas em azul elétrico `#0062ff` com texto branco.
- Cartelas manuais (`.raffle-card`):
  - Fundo `#ffffff`, borda `#e2e8f0`.
  - Pairar o mouse: Elevação suave (`translateY(-2px)`) e borda `#0062ff`.
  - Selecionada: Borda `2px solid #0062ff`, fundo `#eff6ff`.
  - Dezenas/Bolinhas: Fundo neutro suave `#f1f5f9`, texto `#1e293b`.
- Barra de seleção (`.selection-bar`): Fundo azul noturno `#0f172a` com texto nítido e botão de avançar em destaque.

### 3.4. Botões e Ações

- Botão Primário (`.button--primary`): Fundo `#0062ff`, hover `#0052cc`, texto `#ffffff`, sombra `0 4px 14px rgba(0, 98, 255, 0.28)`.
- Botão Secundário (`.button--secondary`): Fundo `#ffffff`, borda `#e2e8f0`, texto `#0f172a`, hover `#f8fafc`.

### 3.5. Carrinho, Formulário e Pagamento

- Cards (`.surface`): Fundo branco puro `#ffffff`, borda `#e2e8f0`, cantos de 18px.
- Pílula de contagem: Fundo verde menta suave `#ecfdf5` com texto verde esmeralda `#059669`.
- Campos de texto (`.field input`): Fundo `#ffffff`, borda `#e2e8f0`, foco com anel em `#0062ff`.
- Telas de estado de pagamento:
  - Sucesso: Ícone em círculo verde menta `#ecfdf5` com ícone verde `#10b981`.
  - Aguardando: Ícone em círculo azul suave `#eff6ff` com ícone azul `#0062ff`.

## 4. Critérios de Aceite e Invariantes

- Nenhum comportamento ou regra de negócio é alterado.
- Os tokens CSS residem centralizados no `:root` em `src/app/styles.css`.
- Todos os estados visuais (foco, hover, disabled, active) preservam contraste de acessibilidade (WCAG AA).
- A responsividade móvel é preservada.
- O lint e os testes de estilo passam sem erros de formatação.
