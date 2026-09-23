# Arquitetura: auth-service

Clean Architecture aplicada ao contexto de **Identidade** do ZipFrames.

Referências: [dominio.md — Identidade](../../domain/dominio.md), [OpenAPI](../../openapi/auth-service.yaml), [AsyncAPI](../../asyncapi/events.yaml), [modelagem de dados](../../data/modelagem-de-dados.md), [regras de camadas](../layers.md).

## Objetivo do serviço

Cadastrar usuário, autenticar e emitir JWT RS256. Publicar `user.registered` pelo outbox, na mesma transação do `INSERT` em `users`. Os outros serviços validam o token contra o JWKS publicado aqui. Este serviço não conhece vídeo, fila de processamento nem object storage.

## Camadas

As dependências apontam para dentro.

```
Frameworks & Drivers  →  Interface Adapters  →  Use Cases  →  Entities
```

| Camada                                    | Pasta                 | O que há aqui                                                                                                      |
| ----------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Entities                                  | `src/domain/`         | `User`, `Password`, `UserRegistered`, erros de domínio                                                             |
| Use Cases                                 | `src/application/`    | `registerUser`, `login`, DTOs e portas (`UserRepository`, `PasswordHasher`, `TokenIssuer`, `Clock`, `IdGenerator`) |
| Interface Adapters + Frameworks & Drivers | `src/infrastructure/` | Prisma, bcrypt, RS256, rotas HTTP, relay do outbox, publisher AMQP                                                 |
| Composition root                          | `src/main/`           | `compose.ts` monta o grafo; `index.ts` trata sinal e shutdown                                                      |

Portas moram em `application/ports/`. Implementações espelham a categoria em `infrastructure/` (`repositories/`, `services/`).

## Mapa de pastas

```
auth-service/src/
├── domain/
│   ├── entities/user.ts
│   ├── valueObjects/password.ts
│   ├── events/userRegistered.ts
│   ├── errors/userErrors.ts
│   └── index.ts
├── application/
│   ├── useCases/
│   │   ├── registerUser/{registerUser.useCase.ts, registerUser.dto.ts}
│   │   └── login/{login.useCase.ts, login.dto.ts}
│   └── ports/
│       ├── repositories/user.repository.ts
│       └── services/{passwordHasher,tokenIssuer,clock,idGenerator}.service.ts
├── infrastructure/
│   ├── http/
│   │   ├── routes/{identity,health}.routes.ts
│   │   └── server.ts
│   ├── repositories/prisma/{schema.prisma,migrations/,client.ts,user.repository.ts}
│   ├── services/crypto/{bcryptPasswordHasher,rs256TokenIssuer,rsaKeys}.ts
│   ├── messaging/{amqpConnection,amqpPublisher,outboxEnvelope,outboxRelay}.ts
│   ├── observability/outboxMetrics.ts
│   └── config.ts
└── main/{compose.ts,index.ts}
```

Não há `ports/gateways/` neste serviço: Postgres é repository; AMQP de saída é orquestrado pelo outbox relay (messaging), não por uma porta de application.

## Casos de uso

| Caso de uso    | O que faz                                                                                                                                                        |
| -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registerUser` | Valida a senha, pede o hash, monta o `User`, monta o envelope de outbox (`id`, `version`, `correlationId`, payload) e persiste user + outbox na mesma transação. |
| `login`        | Normaliza o e-mail, busca o usuário e compara a senha. E-mail desconhecido responde `INVALID_CREDENTIALS` sem comparar hash. Emite o token.                      |

Falha de login é sempre `INVALID_CREDENTIALS`. Erros de aplicação usam `Result` de `@zipframes/core`. Erros HTTP usam Problem Details (RFC 9457) via `@zipframes/core`.

## Outbox

O **caso de uso** decide o que publicar (`user.registered`, versão, payload, `correlationId` vindo do comando HTTP, id via `IdGenerator`). O repositório só persiste a linha de `outbox` na mesma transação do usuário.

- Intervalo: `OUTBOX_INTERVAL_MS` (padrão 2s).
- Teto: `OUTBOX_MAX_ATTEMPTS` (padrão 30).
- Falha de publish incrementa `attempts` e deixa `published_at` nulo.
- A busca é `published_at IS NULL AND attempts < max`, pela ordem de `occurred_at`, com `FOR UPDATE SKIP LOCKED`.
- Ao atingir o teto a linha sai do ciclo; o relay incrementa `outbox_exhausted_total`. Linha esgotada não muda `/health/ready`.

## HTTP

| Método e path                | Papel                                                              |
| ---------------------------- | ------------------------------------------------------------------ |
| `POST /register`             | Cadastro                                                           |
| `POST /login`                | Token                                                              |
| `GET /.well-known/jwks.json` | Chave pública                                                      |
| `GET /health/live`           | Processo de pé (`{ status: "ok" }`)                                |
| `GET /health/ready`          | 200 com Postgres e AMQP; 503 com `{ status: "not_ready", reason }` |
| `GET /metrics`               | Texto Prometheus, incluindo `outbox_exhausted_total`               |

Tudo na porta `PORT` (padrão 3000). Readiness usa `Pingable` + `createReadinessCheck`.

## Onde o processo sobe

Na máquina, o Compose sobe o serviço na rede `zipframes`, depois de `auth-db` e RabbitMQ saudáveis, aplica as migrations e usa a chave de desenvolvimento em `infra/docker-compose/auth/jwt-dev.pem`.

No cluster, o Argo CD aplica [`infra/k8s/auth-service`](../../../infra/k8s/auth-service) pela Application [`infra/argocd/auth-service.yaml`](../../../infra/argocd/auth-service.yaml). A escala é HPA por CPU (mínimo 1, máximo 3, alvo 70%). O Secret fica de fora desse apply.

## Testes

| Pasta        | O que prova                                                            |
| ------------ | ---------------------------------------------------------------------- |
| `tests/unit` | Domínio, casos de uso, HTTP, crypto, config, envelope — com fakes      |
| `tests/int`  | Prisma + outbox e AMQP contra Postgres/RabbitMQ reais (Testcontainers) |
