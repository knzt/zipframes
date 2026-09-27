# HTTP

Todo processo que escuta HTTP usa **Fastify**. Saúde, métricas e a documentação gerada sobem nesse mesmo servidor.

Hoje o único processo HTTP é o `auth-service`. O `processor-worker` consome AMQP e não escuta porta.

A especificação OpenAPI não é um arquivo mantido à mão. `@fastify/swagger` gera o documento a partir das schemas das rotas, e `@fastify/swagger-ui` publica a interface. Onde a rota já valida com Zod (`@zipframes/schemas`), a schema da rota é `z.toJSONSchema` dessa mesma schema. No auth-service, `defineHandler` de `@zipframes/http` fica no controller (`interface-adapters/`): valida entrada e saída, chama o caso de uso e traduz o `Result` em `HttpReply`. As rotas em `infrastructure/http/routes/` só declaram `method`/`path`/`openApi` e delegam ao controller. O login passa um `errorHelper` que responde 401 tanto para corpo inválido quanto para credencial errada, sem distinguir os dois. `bindHttpRoutes` em `infrastructure/http/fastify` registra o catálogo. Fastify fica em `infrastructure/http/fastify/` (`server.ts`, plugins, health). `HttpRouteDefinition` e as schemas de OpenAPI/problem ficam em `infrastructure/http/`, fora da pasta do driver.

Um throw que escapa do handler, nas superfícies HTTP de negócio, responde `500` `application/problem+json` (RFC 9457), com `correlationId` e sem a mensagem interna. O 404 de rota inexistente e o 400 de JSON malformado usam o mesmo envelope. O contrato problem+json vale para os serviços que expõem HTTP de negócio (hoje, o `auth-service`).

## Saúde

Um processo HTTP, um servidor, as mesmas rotas.

| Método e path       | Sucesso                       | Falha                                       |
| ------------------- | ----------------------------- | ------------------------------------------- |
| `GET /health/live`  | `200` `{ "status": "ok" }`    | —                                           |
| `GET /health/ready` | `200` `{ "status": "ready" }` | `503` `{ "status": "not_ready", "reason" }` |
| `GET /metrics`      | `200` texto Prometheus 0.0.4  | `500` texto simples                         |

`reason` é obrigatório no 503. Se a checagem não entrega um `Error`, o valor é `"unknown"`.

A readiness usa `Pingable` e `createReadinessCheck` de `@zipframes/core`. `ping` não entra nas interfaces de negócio.

| Serviço            | Porta | O que a readiness consulta |
| ------------------ | ----- | -------------------------- |
| `auth-service`     | 3000  | Postgres e RabbitMQ        |
| `processor-worker` | —     | Sem HTTP; probes exec      |

## Probes

| Serviço            | Probe     | Como                                    |
| ------------------ | --------- | --------------------------------------- |
| `auth-service`     | liveness  | `GET /health/live`                      |
| `auth-service`     | readiness | `GET /health/ready`                     |
| `processor-worker` | liveness  | exec `kill -0 1` (Compose e Kubernetes) |
| `processor-worker` | readiness | exec `kill -0 1` (Compose e Kubernetes) |

Os manifests estão em `infra/k8s/auth-service/deployment.yaml` e `infra/k8s/processor-worker/deployment.yaml`.

## OpenAPI

O `auth-service` expõe:

| Path             | O que é                      |
| ---------------- | ---------------------------- |
| `GET /docs`      | Swagger UI                   |
| `GET /docs/json` | Documento OpenAPI 3.1 gerado |

| Serviço        | Onde abrir em local          |
| -------------- | ---------------------------- |
| `auth-service` | `http://localhost:3000/docs` |

O teste do auth-service lê `GET /docs/json` e confere que as rotas publicadas saíram das schemas das rotas. O CI não valida um YAML de OpenAPI: o contrato é o documento gerado.
