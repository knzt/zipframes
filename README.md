# ZipFrames

Sistema de processamento de vídeos entregue à **FIAP X**, desenvolvido no hackathon da POSTECH SOAT (Fase 5).

Recebe vídeos enviados por usuários autenticados, extrai um frame por segundo com `ffmpeg` e entrega os frames em um arquivo `.zip`. O processamento é assíncrono, escalável e observável.

## Arquitetura

Microsserviços com Clean Architecture, comunicação por eventos via RabbitMQ, object storage compatível com S3 (SeaweedFS), autenticação com JWT RS256 e deploy em Kubernetes com escala automática pelo tamanho da fila (KEDA).

A documentação completa de arquitetura está em [`docs/`](docs/).

## Monorepo

```
zipframes/
├── services/          # microsserviços independentes
│   ├── auth-service/
│   ├── video-service/
│   ├── processor-worker/
│   ├── notification-service/
│   └── web-client/
├── packages/          # pacotes técnicos compartilhados
│   ├── contracts/     # schemas dos eventos (Zod)
│   ├── messaging/     # publisher, consumer, retry e DLQ
│   ├── observability/ # logger, métricas e tracing
│   ├── http-auth/     # validação de JWT via JWKS
│   └── tooling/       # tsconfig e eslint base
├── infra/             # Docker Compose, Kubernetes e Argo CD
├── docs/              # arquitetura, C4 e ADRs
└── tests/             # testes e2e e de carga
```

Cada serviço tem `package.json`, `Dockerfile`, migrations e testes próprios. **Nenhum serviço importa código de outro serviço.** Código compartilhado fica em `packages/`, que contém apenas código técnico.

## Pré-requisitos

- Node.js 22+
- pnpm 9+
- Docker e Docker Compose

## Desenvolvimento local

```bash
# instalar dependências
pnpm install

# subir a infraestrutura (Postgres, RabbitMQ, Redis, SeaweedFS, Mailpit)
docker compose -f infra/docker-compose/docker-compose.yml up -d

# rodar todos os serviços em modo watch
pnpm build --filter=...
```

## Convenções

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/), validados pelo commitlint no hook `commit-msg`.
- **Formatação:** Prettier, aplicada no hook `pre-commit` via lint-staged.
- **Lint:** ESLint com typescript-eslint em modo strict, com a regra de camadas da Clean Architecture verificada no CI.
- **Branches:** `feat/`, `fix/`, `docs/`, `chore/`, `ci/`, `test/`, `refactor/` saindo da `main`.

## Stack

| Camada | Tecnologia |
|---|---|
| Linguagem | Node.js 22 + TypeScript 5 (strict) |
| HTTP | Fastify |
| Validação | Zod |
| ORM / migrations | Prisma |
| Mensageria | RabbitMQ + amqplib |
| Object storage | SeaweedFS (API S3) |
| Cache | Redis + ioredis |
| E-mail | Nodemailer |
| Banco de dados | PostgreSQL (uma instância por serviço) |
| Testes | Vitest + Testcontainers |
| Monorepo | pnpm workspaces + Turborepo |
| Containers | Docker + Kubernetes (kind) |
| Escala | KEDA (worker escala pelo tamanho da fila) |
| CD | Argo CD (GitOps) |
| Observabilidade | OpenTelemetry + Prometheus + Grafana + Jaeger |
