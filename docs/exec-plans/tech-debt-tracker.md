# Dívida técnica

| Item                                                | Impacto                 | Gatilho para resolver                            |
| --------------------------------------------------- | ----------------------- | ------------------------------------------------ |
| Swagger omite schemas de bilhete/pessoa/venda       | bloqueia DTOs live      | backend publicar schemas ou exemplos             |
| `estabelecimento_id` não fornecido                  | bloqueia listagem real  | configurar ID correto da loja                    |
| Formato de item de bilhete live não observado       | bloqueia validação live | obter concurso ativo com cartelas                |
| API externa não reserva nem vende lote atomicamente | risco pós-pagamento     | backend externo oferecer reserva/transação       |
| Fontes dependem do Google Fonts                     | aparência offline       | hospedar fontes antes de produção                |
| Política legal do sorteio não fornecida             | lançamento              | definir regulamento, elegibilidade e privacidade |
