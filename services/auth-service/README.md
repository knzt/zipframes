# auth-service

Cadastro, autenticação e emissão de tokens do ZipFrames.

Este serviço não conhece vídeos: sua única responsabilidade é identidade. Os demais serviços validam os tokens localmente contra as chaves publicadas aqui, sem chamar o auth-service a cada requisição.

O contrato HTTP é o documento gerado em `GET /docs` (ver [`docs/architecture/http.md`](../../docs/architecture/http.md)). Os eventos que ele publica estão em [`docs/asyncapi/events.yaml`](../../docs/asyncapi/events.yaml). A arquitetura interna está em [`docs/architecture/services/auth-service.md`](../../docs/architecture/services/auth-service.md).

## Camadas

```
src/
├── domain/                 # User, Password, UserRegistered
├── application/
│   ├── useCases/           # LoginUseCase, RegisterUserUseCase
│   └── interfaces/         # ports declarados pelo caso de uso
├── interface-adapters/     # LoginController, RegisterUserController
├── infrastructure/
│   ├── http/               # HttpRouteDefinition, schemas; Fastify em http/fastify/
│   ├── repositories/prisma/
│   ├── gateways/           # EventPublisher AMQP
│   ├── services/crypto/
│   └── messaging/amqplib/  # conexão e topologia
└── main/                   # start.ts, factories
```

```
tests/
├── unit/
├── integration/            # Postgres e RabbitMQ reais, via test-toolkit
└── support/                # fakes das interfaces
```

As regras de dependência entre camadas estão em [`docs/architecture/layers.md`](../../docs/architecture/layers.md) e são verificadas no CI pelo dependency-cruiser.

## Desenvolvimento

O serviço tem o próprio lockfile. Os pacotes `@zipframes/*` vêm do GitHub Packages. O pnpm 12 não expande `${NODE_AUTH_TOKEN}` no `.npmrc` versionado; a linha `//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}` fica no `~/.npmrc`.

`pnpm dev` e `pnpm start` leem `services/auth-service/.env`. O caminho da chave nesse arquivo é relativo a este diretório. `db:deploy` aplica a migration existente. `db:migrate` é `prisma migrate dev`, para alterar o schema.

Da raiz, `pnpm deps:auth pkgname@3.1` (e `-D`) adiciona dependência neste serviço.

```bash
export NODE_AUTH_TOKEN=<seu token>
cp services/auth-service/.env.example services/auth-service/.env
pnpm --dir services/auth-service install
pnpm infra:up
pnpm --dir services/auth-service db:generate
pnpm --dir services/auth-service db:deploy
pnpm --dir services/auth-service dev
```

A imagem e o processo no Compose estão descritos em [`infra/docker-compose/README.md`](../../infra/docker-compose/README.md).
