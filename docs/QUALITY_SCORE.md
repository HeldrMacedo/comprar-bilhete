# Placar de qualidade

Atualizado em 20/09/2026. Escala: A (pronto), B (funcional com lacunas), C (fundação), D (bloqueado).

| Domínio         | Nota | Evidência                                      | Próximo passo                          |
| --------------- | ---- | ---------------------------------------------- | -------------------------------------- |
| Sorteio/seleção | C    | concurso real mapeado; item de bilhete ausente | obter estabelecimento e bilhete ativo  |
| Carrinho        | B    | persistência validada e remoção                | teste de componente                    |
| Checkout        | B    | pedido, reserva, SQLite e checkout próprios    | validar credenciais InfinitePay live   |
| Pagamento       | B    | webhook, fila, payment_check e revisão manual  | teste sandbox/live controlado          |
| Segurança       | B    | reconciliação e preço no servidor              | HTTPS, headers e auditoria operacional |
| E2E             | B    | full-stack aprovado em desktop e Pixel 7       | ampliar cenários de falha live         |

Uma nota só sobe com evidência automatizada ou contrato externo validado.
