# HTTP

Todo processo que escuta HTTP usa **Fastify**. Saúde, métricas e a documentação gerada sobem nesse mesmo servidor.

A especificação OpenAPI não é um arquivo mantido à mão. `@fastify/swagger` gera o documento a partir das schemas das rotas, e `@fastify/swagger-ui` publica a interface. Onde a rota já valida com Zod (`@zipframes/schemas`), a schema da rota é `z.toJSONSchema` dessa mesma schema. A validação em tempo de execução continua no handler, para preservar o status que o caso de uso escolhe (o login responde 401 para um corpo inválido, não 400).

## Saúde

Um processo, um servidor, as mesmas rotas.

| Método e path       | Sucesso                       | Falha                                       |
| ------------------- | ----------------------------- | ------------------------------------------- |
| `GET /health/live`  | `200` `{ "status": "ok" }`    | —                                           |
| `GET /health/ready` | `200` `{ "status": "ready" }` | `503` `{ "status": "not_ready", "reason" }` |
| `GET /metrics`      | `200` texto Prometheus 0.0.4  | `500` texto simples                         |

`reason` é obrigatório no 503. Se a checagem não entrega um `Error`, o valor é `"unknown"`.

A readiness usa `Pingable` e `createReadinessCheck` de `@zipframes/core`. `ping` não entra nas interfaces de negócio.

| Serviço            | Porta | O que a readiness consulta     |
| ------------------ | ----- | ------------------------------ |
| `auth-service`     | 3000  | Postgres e RabbitMQ            |
| `processor-worker` | 8081  | RabbitMQ e o bucket de objetos |

## Probes

Kubernetes e o healthcheck do Compose usam as mesmas rotas.

| Probe     | Path                |
| --------- | ------------------- |
| liveness  | `GET /health/live`  |
| readiness | `GET /health/ready` |

Os manifests estão em `infra/k8s/auth-service/deployment.yaml` e `infra/k8s/processor-worker/deployment.yaml`. O Compose usa `GET /health/ready` nos dois serviços.

## OpenAPI

Cada serviço HTTP expõe:

| Path             | O que é                      |
| ---------------- | ---------------------------- |
| `GET /docs`      | Swagger UI                   |
| `GET /docs/json` | Documento OpenAPI 3.1 gerado |

| Serviço            | Onde abrir em local          |
| ------------------ | ---------------------------- |
| `auth-service`     | `http://localhost:3000/docs` |
| `processor-worker` | `http://localhost:8081/docs` |

O teste de cada serviço lê `GET /docs/json` e confere que as rotas publicadas saíram das schemas das rotas. O CI não valida um YAML de OpenAPI: o contrato é o documento gerado.
