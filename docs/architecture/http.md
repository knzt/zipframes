# HTTP

Todo processo que escuta HTTP usa **Fastify**. Saúde, métricas e a documentação gerada sobem nesse mesmo servidor.

Hoje os processos HTTP são o `auth-service` e o `video-service`. O `processor-worker` consome AMQP e não escuta porta.

No `video-service` todas as rotas de negócio exigem `Authorization: Bearer <token>`: o controller usa `defineAuthenticatedHandler`, que valida o JWT contra o JWKS do auth-service antes de olhar a entrada (401 vem antes de 400). Como `HttpRequest` de `@zipframes/http` só carrega `body`, o serviço passa também `params` e `query` (`RoutedHttpRequest`), e cada controller escolhe o que vira a entrada validada. O documento OpenAPI declara o esquema `bearerAuth`, e o botão _Authorize_ da Swagger UI aceita o token de `POST /login`.

A especificação OpenAPI não é um arquivo mantido à mão. `@fastify/swagger` gera o documento a partir das schemas das rotas, e `@fastify/swagger-ui` publica a interface. Onde a rota já valida com Zod (`@zipframes/schemas`), a schema da rota é `z.toJSONSchema` dessa mesma schema. No auth-service, `defineHandler` de `@zipframes/http` fica no controller (`interface-adapters/`): valida entrada e saída, chama o caso de uso e traduz o `Result` em `HttpReply`. As rotas em `infrastructure/http/routes/` só declaram `method`/`path`/`openApi` e delegam ao controller. O login passa um `errorHelper` que responde 401 tanto para corpo inválido quanto para credencial errada, sem distinguir os dois. `bindHttpRoutes` em `infrastructure/http/fastify` registra o catálogo. Fastify fica em `infrastructure/http/fastify/` (`server.ts`, plugins, health). `HttpRouteDefinition` e as schemas de OpenAPI/problem ficam em `infrastructure/http/`, fora da pasta do driver.

Um throw que escapa do handler, nas superfícies HTTP de negócio, responde `500` `application/problem+json` (RFC 9457), com `correlationId` e sem a mensagem interna. O 404 de rota inexistente e o 400 de JSON malformado usam o mesmo envelope. O contrato problem+json vale para os serviços que expõem HTTP de negócio (`auth-service` e `video-service`).

## Saúde

Um processo HTTP, um servidor, as mesmas rotas.

| Método e path       | Sucesso                       | Falha                                       |
| ------------------- | ----------------------------- | ------------------------------------------- |
| `GET /health/live`  | `200` `{ "status": "ok" }`    | —                                           |
| `GET /health/ready` | `200` `{ "status": "ready" }` | `503` `{ "status": "not_ready", "reason" }` |
| `GET /metrics`      | `200` texto Prometheus 0.0.4  | `500` texto simples                         |

`reason` é obrigatório no 503. Se a checagem não entrega um `Error`, o valor é `"unknown"`.

A readiness usa `Pingable` e `createReadinessCheck` de `@zipframes/core`. `ping` não entra nas interfaces de negócio.

| Serviço            | Porta | O que a readiness consulta                                                            |
| ------------------ | ----- | ------------------------------------------------------------------------------------- |
| `auth-service`     | 3000  | Postgres e RabbitMQ                                                                   |
| `video-service`    | 3001  | Postgres, RabbitMQ e o bucket no storage (Redis não: sem ele a listagem vem do banco) |
| `processor-worker` | —     | Sem HTTP; probes exec                                                                 |

O `video-service` também alimenta `http_requests_total` e `http_request_duration_seconds` por padrão de rota (`/videos/:videoId`), para as séries não crescerem com cada id.

## Probes

| Serviço            | Probe     | Como                                    |
| ------------------ | --------- | --------------------------------------- |
| `auth-service`     | liveness  | `GET /health/live`                      |
| `auth-service`     | readiness | `GET /health/ready`                     |
| `video-service`    | liveness  | `GET /health/live`                      |
| `video-service`    | readiness | `GET /health/ready`                     |
| `processor-worker` | liveness  | exec `kill -0 1` (Compose e Kubernetes) |
| `processor-worker` | readiness | exec `kill -0 1` (Compose e Kubernetes) |

Os manifests estão em `infra/k8s/auth-service/deployment.yaml`, `infra/k8s/video-service/deployment.yaml` e `infra/k8s/processor-worker/deployment.yaml`.

## OpenAPI

O `auth-service` e o `video-service` expõem:

| Path             | O que é                      |
| ---------------- | ---------------------------- |
| `GET /docs`      | Swagger UI                   |
| `GET /docs/json` | Documento OpenAPI 3.1 gerado |

| Serviço         | Onde abrir em local          |
| --------------- | ---------------------------- |
| `auth-service`  | `http://localhost:3000/docs` |
| `video-service` | `http://localhost:3001/docs` |

Os testes dos dois serviços leem `GET /docs/json` e conferem que as rotas publicadas saíram das schemas das rotas. O CI não valida um YAML de OpenAPI: o contrato é o documento gerado.
