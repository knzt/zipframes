# OpenAPI

A fonte da verdade da API HTTP é a schema da rota no serviço que a implementa. `@fastify/swagger` gera o documento OpenAPI 3.1 a partir dessas schemas, e `@fastify/swagger-ui` publica a interface. Este diretório descreve só o que os serviços HTTP que já existem publicam. Não há YAML de contrato aqui.

| Serviço        | Documento gerado                             |
| -------------- | -------------------------------------------- |
| `auth-service` | `GET /docs` e `GET /docs/json` na porta 3000 |

O padrão de rotas, o corpo de saúde e os probes estão em [`docs/architecture/http.md`](../architecture/http.md).

Onde a rota valida com Zod (`@zipframes/schemas`), a schema publicada é `z.toJSONSchema` dessa mesma schema. O handler continua validando com ela, para o status HTTP continuar sendo decisão do caso de uso.
