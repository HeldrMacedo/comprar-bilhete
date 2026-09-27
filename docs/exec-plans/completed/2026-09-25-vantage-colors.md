# Plano de Execução: Atualização Visual com Cores do Layout Vantage

## 1. Objetivo e Critérios de Aceite

- **Objetivo**: Atualizar a folha de estilos do sistema (`src/app/styles.css` e ajustes pontuais de classes/marcação se necessário) para reproduzir fielmente a paleta de cores e o acabamento visual do layout Vantage (SaaS/Fintech limpo, com fundo suave `#f4f6fa`, cartões brancos `#ffffff`, azul elétrico `#0062ff`, ciano `#00c2ff` e verde esmeralda `#10b981`).
- **Critérios de aceite**:
  1. `:root` em `src/app/styles.css` atualizado com as novas variáveis e tokens do Vantage.
  2. Hero estilizado em azul noturno `#0f172a` com anéis em azul elétrico e ciano, e card de prêmio com realce azul elétrico.
  3. Fundo geral, cartões, abas, botões primários e secundários, seletores de cartelas e badges alinhados ao visual do Vantage.
  4. Foco visível por teclado atualizado para azul elétrico para manter acessibilidade WCAG.
  5. Layout móvel e contraste visual totalmente preservados.
  6. Arquitetura e testes do projeto verificados.

## 2. Contexto e Contratos Consultados

- [docs/FRONTEND.md](../../FRONTEND.md): "CSS global usa tokens no `:root`; não adicione outra biblioteca visual sem uma decisão registrada."
- [docs/superpowers/specs/2026-09-25-vantage-colors-design.md](../../superpowers/specs/2026-09-25-vantage-colors-design.md): Especificação do design com o mapeamento completo dos componentes e cores.

## 3. Etapas de Execução

- [x] **Etapa 1**: Atualizar `:root` e tokens fundamentais em `src/app/styles.css`.
- [x] **Etapa 2**: Atualizar estilos de cabeçalho (`.site-header`, `.brand`, `.cart-link`) e estados de foco.
- [x] **Etapa 3**: Atualizar estilos da seção Hero (`.hero`, `.prize-card`, `.eyebrow`, anéis de gradiente) e remover estilos inline pontuais em `HomePage.tsx`.
- [x] **Etapa 4**: Atualizar abas de modo (`.mode-tabs`), cartelas manuais (`.raffle-card`, números), pílulas de quantidade e botões (`.button--primary`, `.button--secondary`, `.selection-bar`).
- [x] **Etapa 5**: Atualizar superfícies de checkout (`.surface`), campos de formulário (`.field input`), resumo do pedido e ícones de status de pagamento (`.payment-icon`).
- [x] **Etapa 6**: Validação visual, formatação (`prettier`) e verificação do projeto.

## 4. Decisões Tomadas e Alternativas Descartadas

- **Decisão**: Adotar `#0f172a` (azul noturno profundo) para o Hero e `#0062ff` (azul elétrico) como cor primária de ação e foco, mantendo as superfícies de conteúdo em `#ffffff` sobre o fundo `#f4f6fa`.
- **Alternativa descartada**: Fundo 100% branco sem contraste entre cards e background (descartado pois o layout de referência possui claro contraste entre o canvas cinza-azulado e os cards brancos elevados).

## 5. Validação Executada e Resultados

- `npm run lint`: 0 warnings, 0 errors.
- `npm run validate:architecture`: Sucesso ("Arquitetura validada.").
- `npm run validate:docs`: Sucesso ("Documentação validada.").
- `npm test`: 19 arquivos de teste e 82 testes unitários e de integração aprovados.
- `npm run test:e2e`: 10 testes Playwright de ponta a ponta executados e aprovados em navegadores desktop e mobile.
- `npm run build`: Build TypeScript e Vite gerados com sucesso.
