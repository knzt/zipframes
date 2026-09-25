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
├── infra/             # Docker Compose, Kubernetes e Argo CD
├── docs/              # arquitetura, C4 e ADRs
└── tests/             # testes e2e e de carga
```

Cada serviço tem o próprio `package.json`, `Dockerfile`, migrations e testes. **Nenhum serviço importa código de outro serviço.** O repositório é um workspace pnpm (`pnpm-workspace.yaml`): um `pnpm-lock.yaml` na raiz trava o tooling e os serviços, e cada serviço continua sendo construído e testado sozinho (`pnpm --filter`). As dependências `@zipframes/*` vêm do registro, não de `file:`.

O código compartilhado não vive aqui: ele é publicado como pacotes npm (`@zipframes/*`) a partir de um repositório próprio, e cada serviço declara a versão que usa. Assim um serviço só adota uma mudança quando escolhe subir de versão, em vez de ser afetado no mesmo instante.

| Pacote                     | Conteúdo                                                                                                          |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `@zipframes/schemas`       | Contratos de eventos e de API, usados por mais de um serviço ou por consumidores externos                         |
| `@zipframes/value-objects` | Value objects genéricos (e-mail, CPF, CNPJ, telefone, CEP, endereço) e o value object base para criar os próprios |
| `@zipframes/core`          | `Result`, branded types e erros base                                                                              |
| `@zipframes/messaging`     | Publisher, consumer, retry e DLQ                                                                                  |
| `@zipframes/observability` | Logger, métricas e tracing                                                                                        |
| `@zipframes/http-auth`     | Validação de JWT via JWKS                                                                                         |

Os pacotes trazem **forma**, nunca **política**: validam o que é universal (um CPF é válido em qualquer sistema) e deixam para o serviço as regras que pertencem ao seu contexto, como a política de senha ou as extensões de vídeo aceitas.

## Pré-requisitos

- Node.js 26+
- pnpm 12+
- Docker e Docker Compose

## Desenvolvimento local

```bash
# workspace inteiro (tooling e serviços)
# O pnpm 12 não expande ${NODE_AUTH_TOKEN} no .npmrc versionado.
# No ~/.npmrc: //npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
pnpm install

# subir a infraestrutura (Postgres, RabbitMQ, Redis, SeaweedFS, Mailpit)
pnpm infra:up

# build / testes de um serviço, sem construir o outro
pnpm --filter @zipframes/processor-worker test
```

## Convenções

- **Commits:** [Conventional Commits](https://www.conventionalcommits.org/), validados pelo commitlint no hook `commit-msg`.
- **Formatação:** Prettier, aplicada no hook `pre-commit` via lint-staged.
- **Lint:** ESLint com typescript-eslint em modo strict, com a regra de camadas da Clean Architecture verificada no CI.
- **Branches:** `feat/`, `fix/`, `docs/`, `chore/`, `ci/`, `test/`, `refactor/` saindo da `main`.

## CI

Cada serviço é construído, testado e empacotado no próprio workflow (`.github/workflows/auth-service.yml` e `processor-worker.yml`), com filtro de caminho. Os dois chamam `.github/workflows/service-ci.yml`. O workflow da raiz só formata o repositório e valida o AsyncAPI. A imagem fica com a tag local já usada nos manifests (`zipframes-auth-service:local`, `zipframes-processor-worker:local`) e não é publicada.

## Stack

| Camada           | Tecnologia                                            |
| ---------------- | ----------------------------------------------------- |
| Linguagem        | Node.js 26 + TypeScript 5 (strict)                    |
| HTTP             | Fastify (API e saúde, em todo serviço)                |
| Validação        | Zod                                                   |
| ORM / migrations | Prisma                                                |
| Mensageria       | RabbitMQ + amqplib                                    |
| Object storage   | SeaweedFS (API S3)                                    |
| Cache            | Redis + ioredis                                       |
| E-mail           | Nodemailer                                            |
| Banco de dados   | PostgreSQL (uma instância por serviço)                |
| Testes           | Vitest + Testcontainers                               |
| Monorepo         | workspace pnpm (`pnpm-workspace.yaml`)                |
| Containers       | Docker + Kubernetes (kind)                            |
| Escala           | KEDA (worker escala pelo tamanho da fila)             |
| CD               | Argo CD (GitOps), imagens locais, sem deploy em nuvem |
| Observabilidade  | OpenTelemetry + Prometheus + Grafana + Jaeger         |
