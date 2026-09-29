# OpenAPI

A fonte da verdade da API HTTP é a schema da rota no serviço que a implementa. `@fastify/swagger` gera o documento OpenAPI 3.1 a partir dessas schemas, e `@fastify/swagger-ui` publica a interface. Este diretório descreve só o que os serviços HTTP que já existem publicam. Não há YAML de contrato aqui.

| Serviço         | Documento gerado                             |
| --------------- | -------------------------------------------- |
| `auth-service`  | `GET /docs` e `GET /docs/json` na porta 3000 |
| `video-service` | `GET /docs` e `GET /docs/json` na porta 3001 |

As rotas de saúde, métricas e documentação comuns aos dois serviços estão na [visão geral da arquitetura](../architecture/README.md#http).

Onde a rota valida com Zod (`@zipframes/schemas`), a schema publicada é `z.toJSONSchema` dessa mesma schema. O handler continua validando com ela, para o status HTTP continuar sendo decisão do caso de uso.
