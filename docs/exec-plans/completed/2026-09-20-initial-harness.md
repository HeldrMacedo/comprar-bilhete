# Fundação agent-first e MVP navegável

Status: concluído em 20/09/2026.

Objetivo: estruturar o repositório segundo Harness Engineering e entregar jornada React navegável de seleção ao pagamento.

Entregue: mapa `AGENTS.md`, documentação como fonte de verdade, arquitetura por camadas, validações Zod, modo mock/live explícito, seleção aleatória/manual, carrinho persistido, identificação, criação de checkout por adaptador, tela de confirmação, CI e verificações estruturais.

Decisão: a InfinitePay não é chamada diretamente pelo browser. A criação do link e confirmação ficam no backend para que preço e status não possam ser adulterados. O contrato live permaneceu proposto porque o host informado não respondeu.

Validação: `npm run check` aprovado (lint, formato, arquitetura, documentação, 2 testes unitários e build); `npm run test:e2e` aprovado em Chromium desktop e perfil móvel Pixel 7.
