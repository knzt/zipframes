# auth-service

Cadastro, autenticação e emissão de tokens do ZipFrames.

Este serviço não conhece vídeos: sua única responsabilidade é identidade. Os demais serviços validam os tokens localmente contra as chaves publicadas aqui, sem chamar o auth-service a cada requisição.

O contrato HTTP está em [`docs/openapi/auth-service.yaml`](../../docs/openapi/auth-service.yaml) e os eventos que ele publica, em [`docs/asyncapi/events.yaml`](../../docs/asyncapi/events.yaml). A arquitetura interna está em [`docs/architecture/services/auth-service.md`](../../docs/architecture/services/auth-service.md).

## Camadas

```
src/
├── domain/                 # User, Password, UserRegistered, UserRepository, PasswordHasher
├── application/
│   ├── use-cases/          # register-user, login
│   ├── token-issuer.ts
│   ├── clock.ts
│   └── id-generator.ts
├── infrastructure/
│   ├── config.ts
│   ├── http/               # controllers
│   ├── repositories/prisma/  # schema, migrations, client e PrismaUserRepository
│   ├── crypto/             # bcrypt e RS256
│   ├── messaging/          # conexão, publisher, envelope, relay
│   └── observability/
└── main/
    ├── compose.ts          # wiring
    └── index.ts            # sinais
```

```
tests/
├── unit/
└── support/                # fakes das interfaces
```

As regras de dependência entre camadas estão em [`docs/architecture/layers.md`](../../docs/architecture/layers.md) e são verificadas no CI pelo dependency-cruiser.

## Desenvolvimento

O serviço tem o próprio lockfile. Os pacotes `@zipframes/*` vêm do GitHub Packages.

```bash
export NODE_AUTH_TOKEN=<seu token>
pnpm --dir services/auth-service install
pnpm infra:up
pnpm --dir services/auth-service db:migrate
pnpm --dir services/auth-service test
```

A imagem e o processo no Compose estão descritos em [`infra/docker-compose/README.md`](../../infra/docker-compose/README.md).
