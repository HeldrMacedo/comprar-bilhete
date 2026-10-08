# Concorrência na reserva de bilhetes

Status: aceito. Implementado e desligado (`TICKET_RESERVATION_PROVIDER=none`) até a API de bilhetes publicar os endpoints de reserva.

## Decisão

O mesmo bilhete pode ser vendido por outros canais além deste backend. Cada bilhete ganha uma trava com prazo (lease) na coluna `bilhete.reservado` da API de bilhetes, além da reserva local no SQLite:

1. Ao criar o pedido, o backend reserva localmente (transação SQLite) e depois reserva cada bilhete na API de bilhetes, em ordem `(concurso, numero)`. Em conflito ou falha, libera as travas já obtidas, cancela o pedido local e responde `409 TICKET_RESERVED` (ou `502`).
2. Com o pagamento confirmado, o backend consulta a trava de cada bilhete e só chama `PUT /bilhete/validar` (que grava `validado`) se ela ainda pertencer ao pedido. Se não pertencer, o pedido vai para `manual_review`.
3. O worker libera as travas de pedidos expirados ou cancelados; falha de liberação fica registrada e é tentada de novo. O prazo externo é a rede de segurança.
4. A listagem live omite bilhetes validados ou com reserva dentro do prazo, quando a API devolver esses campos.

As travas remotas ficam em `remote_reservations` (`held`, `released`, `lost`, `validated`).

## Técnica

A verificação e a gravação precisam ser uma única instrução no MySQL; ler e depois gravar deixa dois canais reservarem ao mesmo tempo. A tabela não tem coluna de dono, então o valor gravado em `data_reservado` funciona como token de posse.

Contrato pedido à equipe da API de bilhetes (caminho provisório `PUT`/`GET /bilhete/reservado`):

```sql
-- Reservar (reservado: true): 1 linha afetada = 200 com data_reservado; 0 linhas = 409
SET @agora = NOW();
UPDATE bilhete
SET reservado = b'1', data_reservado = @agora
WHERE concurso_id = ? AND numero = ? AND estabelecimento_id = ?
  AND (validado IS NULL OR validado = b'0')
  AND (devolvido IS NULL OR devolvido = b'0')
  AND (reservado IS NULL OR reservado = b'0'
       OR data_reservado < @agora - INTERVAL :ttl_minutos MINUTE);

-- Liberar (reservado: false, data_reservado: token): 1 linha = 200; 0 linhas = 409
UPDATE bilhete
SET reservado = b'0', data_reservado = NULL
WHERE concurso_id = ? AND numero = ? AND estabelecimento_id = ?
  AND reservado = b'1' AND data_reservado = ?
  AND (validado IS NULL OR validado = b'0');
```

A consulta (`GET`) devolve `success`, `reservado`, `data_reservado` e `validado`, ou `404` para bilhete inexistente. `TICKET_RESERVATION_TTL_MINUTES` deve ser igual a `ttl_minutos` e maior que `ORDER_EXPIRATION_MINUTES`.

## Motivo

- A reserva remota fica fora da transação SQLite porque `node:sqlite` é síncrono: manter `BEGIN IMMEDIATE` aberto durante HTTP bloquearia todas as escritas. A consistência vem da compensação.
- O provider `none` é um null object: o serviço sempre passa pelo coordenador, sem condicionais espalhadas.
- Pedidos criados antes da ativação (sem linhas em `remote_reservations`) seguem o fluxo anterior na confirmação.

## Alternativas descartadas

- Ler e depois gravar `reservado`: corrida entre canais.
- `SELECT ... FOR UPDATE` na API de bilhetes: a trava de linha ficaria presa durante o checkout.
- Trocar automaticamente o bilhete da surpresinha em conflito externo: exige reescrever itens do pedido; registrado como dívida.

## Riscos conhecidos

- O token tem precisão de segundos: um reenvio de liberação pode, em caso raro, liberar a trava de outro canal reservada no mesmo segundo.
- `PUT /bilhete/validar` não exige a trava; sobra uma janela entre a conferência e a validação.
