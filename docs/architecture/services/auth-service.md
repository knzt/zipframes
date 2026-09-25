# Arquitetura: auth-service

Arquitetura do contexto de **Identidade** do ZipFrames. A Clean Architecture é a base; o mapa de pastas está em [layers.md](../layers.md).

Referências: [dominio.md — Identidade](../../domain/dominio.md), [HTTP e OpenAPI gerado](../http.md), [AsyncAPI](../../asyncapi/events.yaml), [modelagem de dados](../../data/modelagem-de-dados.md), [regras de camadas](../layers.md).

## Objetivo do serviço

Cadastrar usuário, autenticar e emitir JWT RS256. Publicar `user.registered` pelo outbox, na mesma transação do `INSERT` em `users`. Os outros serviços validam o token contra o JWKS publicado aqui. Este serviço não conhece vídeo, fila de processamento nem object storage.

## Camadas

As dependências apontam para dentro. `application/` junta o que o livro separa: casos de uso e interface adapters. O caso de uso fica em `application/useCases/` e a interface que ele declara fica em `application/interfaces/`; a classe que implementa essa interface fica em `infrastructure/`. O raciocínio dessa decisão está em [layers.md](../layers.md).

Neste serviço, a rota Fastify em `infrastructure/http` só liga o framework. O controller em `application/controllers/` recebe o pedido já traduzido, chama `registerUser` ou `login` e devolve status e corpo. O caso de uso só enxerga as interfaces que declara. `main/compose.ts` instancia o repositório Prisma, o hasher bcrypt e o emissor RS256, monta o caso de uso e entrega o controller à rota. O controller não importa Fastify, Prisma nem bcrypt.

```
infrastructure  →  application  →  domain
```

| Pasta                 | Neste projeto                     | O que há aqui                                                                                                                            |
| --------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/`         | Entidades                         | `User`, `Password`, `UserRegistered`, erros de domínio                                                                                   |
| `src/application/`    | Casos de uso e interface adapters | `registerUser`, `login`, controllers HTTP, DTOs e interfaces (`UserRepository`, `PasswordHasher`, `TokenIssuer`, `Clock`, `IdGenerator`) |
| `src/infrastructure/` | Implementação e frameworks        | Prisma, bcrypt, RS256, rotas HTTP, relay do outbox, publisher AMQP                                                                       |
| `src/main/`           | Composition root                  | `compose.ts` monta o grafo; `index.ts` trata sinal e shutdown                                                                            |

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
│   ├── controllers/{registerUser,login}.controller.ts
│   ├── useCases/
│   │   ├── registerUser/{registerUser.useCase.ts, registerUser.dto.ts}
│   │   └── login/{login.useCase.ts, login.dto.ts}
│   └── interfaces/
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

A persistência é repository: `UserRepository` em `application/interfaces/repositories/` e `PrismaUserRepository` em `infrastructure/repositories/prisma/`. A publicação AMQP não é uma interface que o caso de uso declara. O caso de uso grava o envelope do outbox na mesma transação do usuário, e o relay em `infrastructure/messaging` publica depois.

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
| `GET /docs`                  | Swagger UI gerada das schemas das rotas                            |
| `GET /docs/json`             | Documento OpenAPI 3.1 gerado                                       |

Tudo na porta `PORT` (padrão 3000), no Fastify. Readiness usa `Pingable` + `createReadinessCheck`. O contrato está em [http.md](../http.md).

## Onde o processo sobe

Na máquina, o Compose sobe o serviço na rede `zipframes`, depois de `auth-db` e RabbitMQ saudáveis, aplica as migrations e usa a chave de desenvolvimento em `infra/docker-compose/auth/jwt-dev.pem`.

No cluster, o Argo CD aplica [`infra/k8s/auth-service`](../../../infra/k8s/auth-service) pela Application [`infra/argocd/auth-service.yaml`](../../../infra/argocd/auth-service.yaml). A escala é HPA por CPU (mínimo 1, máximo 3, alvo 70%). O Secret fica de fora desse apply.

## Testes

| Pasta               | O que prova                                                       |
| ------------------- | ----------------------------------------------------------------- |
| `tests/unit`        | Domínio, casos de uso, HTTP, crypto, config, envelope — com fakes |
| `tests/integration` | HTTP de register e login contra Postgres real                     |
