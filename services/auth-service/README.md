# auth-service

Cadastro, autenticação e emissão de tokens do ZipFrames.

Este serviço não conhece vídeos: sua única responsabilidade é identidade. Os demais serviços validam os tokens localmente contra as chaves publicadas aqui, sem chamar o auth-service a cada requisição.

O contrato HTTP é o documento gerado em `GET /docs` (ver [`docs/architecture/http.md`](../../docs/architecture/http.md)). Os eventos que ele publica estão em [`docs/asyncapi/events.yaml`](../../docs/asyncapi/events.yaml). A arquitetura interna está em [`docs/architecture/services/auth-service.md`](../../docs/architecture/services/auth-service.md).

## Camadas

```
src/
├── domain/                 # User, Password, UserRegistered
├── application/
│   ├── controllers/        # LoginController, RegisterUserController
│   ├── useCases/           # LoginUseCase, RegisterUserUseCase
│   └── interfaces/         # interface adapters declarados pelo caso de uso
├── infrastructure/
│   ├── http/               # Fastify, rotas, OpenAPI gerado e HttpReply
│   ├── repositories/prisma/
│   ├── services/crypto/
│   ├── messaging/
│   └── observability/
└── main/                   # composition root
```

```
tests/
├── unit/
└── support/                # fakes das interfaces
```

As regras de dependência entre camadas estão em [`docs/architecture/layers.md`](../../docs/architecture/layers.md) e são verificadas no CI pelo dependency-cruiser.

## Desenvolvimento

O serviço tem o próprio lockfile. Os pacotes `@zipframes/*` vêm do GitHub Packages. O pnpm 12 não expande `${NODE_AUTH_TOKEN}` no `.npmrc` versionado; a linha `//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}` fica no `~/.npmrc`.

```bash
export NODE_AUTH_TOKEN=<seu token>
pnpm --dir services/auth-service install
pnpm infra:up
pnpm --dir services/auth-service db:migrate
pnpm --dir services/auth-service test
```

A imagem e o processo no Compose estão descritos em [`infra/docker-compose/README.md`](../../infra/docker-compose/README.md).
