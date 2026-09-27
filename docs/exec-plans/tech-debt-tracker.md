# Dívida técnica

| Item                                                          | Impacto                              | Gatilho para resolver                                                             |
| ------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| Swagger omite schemas de bilhete/pessoa/venda                 | bloqueia DTOs live                   | backend publicar schemas ou exemplos                                              |
| `estabelecimento_id` não fornecido                            | bloqueia listagem real               | configurar ID correto da loja                                                     |
| Formato de item de bilhete live não observado                 | bloqueia validação live              | obter concurso ativo com cartelas                                                 |
| Endpoint de reserva em `bilhete.reservado` não publicado      | reserva externa desligada            | API publicar `PUT`/`GET` condicionais; ajustar `RESERVATION_PATH` e ativar `live` |
| Token de reserva é `data_reservado` (precisão de segundos)    | reenvio raro libera trava alheia     | API aceitar token próprio (coluna nova ou `numorder`)                             |
| `PUT /bilhete/validar` não é condicional à reserva            | janela entre conferência e validação | API validar só com `validado = 0` e token da reserva                              |
| Surpresinha não troca cartela em conflito externo             | cliente precisa tentar de novo       | medir frequência de `TICKET_RESERVED` em surpresinha                              |
| Fontes dependem do Google Fonts                               | aparência offline                    | hospedar fontes antes de produção                                                 |
| Política legal do sorteio não fornecida                       | lançamento                           | definir regulamento, elegibilidade e privacidade                                  |
| Disponíveis vêm com `lote_validacao` vazio e `posicao_lote` 0 | compra live não valida bilhete       | confirmar com a API de bilhetes quais valores enviar em `PUT /bilhete/validar`    |
| API de bilhetes só responde por HTTP                          | CPF/telefone sem TLS                 | origem HTTPS oficial; remover `TICKET_API_ALLOW_HTTP`                             |
