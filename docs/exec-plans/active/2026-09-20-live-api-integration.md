# Integração com a API live

Status: em andamento, aguardando dados/contratos do backend.

## Objetivo e critérios de aceite

Substituir o contrato frontend proposto pelo contrato publicado em `http://66.94.99.64:9090/swagger/doc/json`, sem confiar em formatos não documentados nem confirmar pagamento no navegador.

Aceite: concurso e bilhetes reais carregam com schemas validados; pedido é criado no backend; backend gera checkout InfinitePay; webhook confirma o Pix; frontend consulta o pedido e só então mostra sucesso.

## Evidências de 20/09/2026

- `/health` respondeu online, versão 1.0.0.
- `/concurso/atual` respondeu 404 porque não há concurso ativo.
- `/concurso` retornou os concursos 2024027 e 2024028; ambos já encerrados.
- `/concurso/{id}` forneceu o formato detalhado e o preço em reais.
- `/bilhete/disponiveis` exige `concurso_id` e `estabelecimento_id`; o Swagger não documenta o formato dos itens.
- O valor de `estabelecimento_id` da loja não foi fornecido.
- O Swagger não contém endpoints de pedido, checkout InfinitePay, webhook ou status do pagamento.
- O Swagger declara corpos de escrita apenas como `string`, sem DTOs.

## Decisões

- Remover do adaptador live as rotas `/api/v1/*` que não existem.
- Não chamar `/bilhete/validar` após um simples redirect: parâmetros do navegador não provam pagamento.
- Manter o modo mock para a jornada completa enquanto o backend de pagamento não estiver disponível.

## Próximas etapas

- [x] Auditar Swagger, respostas reais de leitura e CORS.
- [x] Mapear o DTO real de concurso.
- [x] Impedir chamadas live a endpoints inexistentes de checkout.
- [ ] Obter `estabelecimento_id` correto e um concurso com bilhetes disponíveis.
- [ ] Mapear o item real de `/bilhete/disponiveis` sem campos adivinhados.
- [ ] Obter/adicionar DTOs de `/pessoa` e `/bilhete/validar`.
- [ ] Adicionar endpoints seguros de pedido e pagamento no backend.
- [ ] Validar a jornada live de ponta a ponta.
