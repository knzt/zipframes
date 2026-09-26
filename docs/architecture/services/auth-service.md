# Arquitetura: auth-service

Arquitetura do contexto de **Identidade** do ZipFrames. A Clean Architecture é a base; o mapa de pastas está em [layers.md](../layers.md).

Referências: [dominio.md — Identidade](../../domain/dominio.md), [HTTP e OpenAPI gerado](../http.md), [AsyncAPI](../../asyncapi/events.yaml), [modelagem de dados](../../data/modelagem-de-dados.md), [regras de camadas](../layers.md).

## Objetivo do serviço

Cadastrar usuário, autenticar e emitir JWT RS256. Depois de gravar o usuário, publicar `user.registered` no exchange `zipframes.events` via `EventPublisher`. Os outros serviços validam o token contra o JWKS publicado aqui. Este serviço não conhece vídeo, fila de processamento nem object storage.

## Camadas

As dependências apontam para dentro. `application/` junta o que o livro separa: casos de uso e interface adapters. O caso de uso fica em `application/useCases/` e a interface que ele declara fica em `application/interfaces/`; a classe que implementa essa interface fica em `infrastructure/`. O raciocínio dessa decisão está em [layers.md](../layers.md).

Neste serviço, a rota Fastify em `infrastructure/http` só liga o framework: path, schema OpenAPI e `sendHttpReply`. O correlation id é calculado no `onRequest` de `server.ts`. O handler em `infrastructure/http/handlers/` é `defineHandler` de `@zipframes/http` (JWKS tem o próprio handler): valida o pedido, chama o controller e devolve `HttpReply`. O controller em `application/controllers/` chama `RegisterUserUseCase` ou `LoginUseCase` e devolve `Result`. Cadastro usa o `errorHelper` padrão (`statusCode` + `message`). Login passa um `errorHelper` que sempre responde 401. O caso de uso só enxerga as interfaces que declara. `main/compose.ts` instancia o repositório Prisma, o hasher bcrypt, o emissor RS256 e o `EventPublisher` AMQP e chama `buildIdentityApp`. O controller não importa Fastify, Prisma nem bcrypt. `@zipframes/authenticator` continua só em teste — o auth emite JWT, não verifica nas rotas de register/login.

```
infrastructure  →  application  →  domain
```

| Pasta                 | Neste projeto                     | O que há aqui                                                                                                                                                             |
| --------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/`         | Entidades                         | `User`, `Password`, `UserRegistered`, erros de domínio                                                                                                                    |
| `src/application/`    | Casos de uso e interface adapters | `RegisterUserUseCase`, `LoginUseCase`, controllers HTTP, tipos e interfaces (`UserRepository`, `EventPublisher`, `PasswordHasher`, `TokenIssuer`, `Clock`, `IdGenerator`) |
| `src/infrastructure/` | Implementação e frameworks        | Prisma, bcrypt, RS256, rotas HTTP, conexão AMQP e o gateway que publica o evento                                                                                          |
| `src/main/`           | Composition root                  | `compose.ts` resolve os adapters e chama `buildIdentityApp`; `identityApp.ts` monta o Fastify; `index.ts` trata sinal e shutdown                                          |

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
│   ├── controllers/{RegisterUserController.ts, LoginController.ts}
│   ├── useCases/
│   │   ├── registerUser/{RegisterUserUseCase.ts, registerUser.types.ts}
│   │   └── login/{LoginUseCase.ts, login.types.ts}
│   └── interfaces/
│       ├── repositories/UserRepository.ts
│       ├── gateways/EventPublisher.ts
│       └── services/{PasswordHasher,TokenIssuer,Clock,IdGenerator}.ts
├── infrastructure/
│   ├── http/{openapi.ts, server.ts, fastifyAdapter.ts, problemDetails.schema.ts, handlers/{registerUser,login,jwks}Handler.ts, routes/{identity,health}.routes.ts}
│   ├── repositories/prisma/{schema.prisma,migrations/,client.ts,user.repository.ts}
│   ├── gateways/amqpEventPublisher.gateway.ts
│   ├── services/{systemClock.ts,uuidIdGenerator.ts,crypto/{bcryptPasswordHasher,rs256TokenIssuer,rsaKeys}.ts}
│   ├── messaging/{amqpConnection,amqpPublisher,topology}.ts
│   └── loadEnvConfig.ts
└── main/{compose.ts,identityApp.ts,index.ts}
```

A persistência é repository: `UserRepository` em `application/interfaces/repositories/` e `PrismaUserRepository` em `infrastructure/repositories/prisma/`. A publicação AMQP é gateway: `EventPublisher` em `application/interfaces/gateways/` e `createAmqpEventPublisher` em `infrastructure/gateways/`. `messaging/` só tem a conexão e o `PublishPort`. Quem o caso de uso chama é `EventPublisher`. Prisma só tem `users`.

## Casos de uso

| Caso de uso           | O que faz                                                                                                                                                                                                                                                            |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RegisterUserUseCase` | Valida a senha, monta o `User` (`User.create` valida nome e e-mail), verifica o e-mail com `findByEmail`, pede o hash, grava com `UserRepository.create(user)` e publica `UserRegistered` pelo `EventPublisher`. Não faz bcrypt antes da validação nem da unicidade. |
| `LoginUseCase`        | Normaliza o e-mail, busca o usuário e compara a senha. E-mail desconhecido responde `INVALID_CREDENTIALS` sem comparar hash. Emite o token. Não publica evento.                                                                                                      |

Falha de login é sempre `INVALID_CREDENTIALS`. Erros de aplicação usam `Result` de `@zipframes/core`. Erros HTTP usam Problem Details (RFC 9457) via `@zipframes/core`.

## Publicação de `user.registered`

O cadastro não usa outbox. Depois do `INSERT` em `users`, o caso de uso chama `eventPublisher.publish(...)`. O gateway AMQP monta o envelope (`eventId`, `version`, `occurredAt`) e publica no exchange `EVENT_EXCHANGE` (`zipframes.events`) com routing key `user.registered`.

Furo consciente (dual-write): se o processo morrer **depois** do commit e **antes** do ack do Rabbit, o usuário existe e o evento não sai. `/health/ready` já exige AMQP. O consumidor continua idempotente. Se o publish falhar com o usuário já gravado, o HTTP ainda responde sucesso do cadastro — um retry do cliente cairia em e-mail duplicado (`EMAIL_TAKEN`); o erro de publish vai para o log.

## HTTP

| Método e path                | Papel                                                              |
| ---------------------------- | ------------------------------------------------------------------ |
| `POST /register`             | Cadastro                                                           |
| `POST /login`                | Token                                                              |
| `GET /.well-known/jwks.json` | Chave pública                                                      |
| `GET /health/live`           | Processo de pé (`{ status: "ok" }`)                                |
| `GET /health/ready`          | 200 com Postgres e AMQP; 503 com `{ status: "not_ready", reason }` |
| `GET /metrics`               | Texto Prometheus                                                   |
| `GET /docs`                  | Swagger UI gerada das schemas das rotas                            |
| `GET /docs/json`             | Documento OpenAPI 3.1 gerado                                       |

Tudo na porta `PORT` (padrão 3000), no Fastify. Readiness usa `Pingable` + `createReadinessCheck`. O contrato está em [http.md](../http.md).

## Onde o processo sobe

Na máquina, o Compose sobe o serviço na rede `zipframes`, depois de `auth-db` e RabbitMQ saudáveis, aplica as migrations e usa a chave de desenvolvimento em `infra/docker-compose/auth/jwt-dev.pem`.

No cluster, o Argo CD aplica [`infra/k8s/auth-service`](../../../infra/k8s/auth-service) pela Application [`infra/argocd/auth-service.yaml`](../../../infra/argocd/auth-service.yaml). A escala é HPA por CPU (mínimo 1, máximo 3, alvo 70%). O Secret fica de fora desse apply.

## Testes

| Pasta               | O que prova                                                                                       |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| `tests/unit`        | Domínio, casos de uso, HTTP, crypto, config, gateway AMQP — com fakes, inclusive `EventPublisher` |
| `tests/integration` | HTTP de register e login contra Postgres; register publica `user.registered` no RabbitMQ real     |
