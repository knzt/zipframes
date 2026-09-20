# auth-service

Cadastro, autenticação e emissão de tokens do ZipFrames.

Este serviço não conhece vídeos: sua única responsabilidade é identidade. Os demais serviços validam os tokens localmente contra as chaves publicadas aqui, sem chamar o auth-service a cada requisição ([ADR-0011](../../docs/architecture/layers.md)).

O contrato HTTP está em [`docs/openapi/auth-service.yaml`](../../docs/openapi/auth-service.yaml) e os eventos que ele publica, em [`docs/asyncapi/events.yaml`](../../docs/asyncapi/events.yaml).

## Camadas

```
src/
├── domain/        # Entities: User, Password, eventos de domínio
├── application/   # Use Cases e ports
│   ├── use-cases/
│   └── ports/
├── adapters/      # Interface Adapters
│   ├── http/          # rotas, DTOs
│   ├── messaging/     # outbox relay
│   ├── persistence/   # repositórios Prisma
│   └── crypto/        # bcrypt, assinatura RS256
├── frameworks/    # servidor Fastify, Prisma Client
└── main/          # composition root
```

As regras de dependência entre camadas estão em [`docs/architecture/layers.md`](../../docs/architecture/layers.md) e são verificadas no CI pelo dependency-cruiser.

## Desenvolvimento

```bash
pnpm infra:up                                   # sobe Postgres, RabbitMQ e o resto
pnpm --filter @zipframes/auth-service db:migrate
pnpm --filter @zipframes/auth-service test
```

Os pacotes `@zipframes/*` vêm do GitHub Packages, que exige autenticação. Antes do primeiro `pnpm install`, exporte um token com `read:packages`:

```bash
export NODE_AUTH_TOKEN=<seu token>
```
