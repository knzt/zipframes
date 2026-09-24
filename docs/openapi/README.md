# OpenAPI

A fonte da verdade da API HTTP é a schema da rota no serviço que a implementa. `@fastify/swagger` gera o documento OpenAPI 3.1 a partir dessas schemas, e `@fastify/swagger-ui` publica a interface. Não há um YAML mantido à mão para os serviços que já existem.

| Serviço            | Documento gerado                             |
| ------------------ | -------------------------------------------- |
| `auth-service`     | `GET /docs` e `GET /docs/json` na porta 3000 |
| `processor-worker` | `GET /docs` e `GET /docs/json` na porta 8081 |

O padrão de rotas, o corpo de saúde e os probes estão em [`docs/architecture/http.md`](../architecture/http.md).

Onde a rota valida com Zod (`@zipframes/schemas`), a schema publicada é `z.toJSONSchema` dessa mesma schema. O handler continua validando com ela, para o status HTTP continuar sendo decisão do caso de uso.

## Esboço do video-service

[`video-service.yaml`](video-service.yaml) descreve um serviço que **ainda não existe**. Não é contrato, não entra no CI e será substituído pela geração no Fastify quando o serviço for escrito. Até lá, o comportamento esperado continua em [`docs/domain/dominio.md`](../domain/dominio.md).
