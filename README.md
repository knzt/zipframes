# ZipFrames

Dois processos neste repositório. O `auth-service` cadastra usuários e emite JWT RS256. O `processor-worker` consome `video.uploaded`, extrai um frame por segundo com `ffmpeg` e grava um zip no storage. Não há serviço de upload, notificação nem cliente web aqui. Sem alguém publicando `video.uploaded`, o worker sobe e fica ocioso.

## Organização

```
zipframes/
├── services/auth-service/       # identidade, Postgres e publicação de eventos
├── services/processor-worker/   # frames e zip, sem banco
├── infra/docker-compose/        # Postgres, RabbitMQ, SeaweedFS e o resto da máquina
├── infra/k8s/                   # manifests dos dois processos; não inclui a infra
└── docs/                        # arquitetura e contratos
```

Cada serviço tem o próprio `package.json` e `pnpm-lock.yaml`. A raiz só instala lint, format e hooks. Nenhum serviço importa código do outro. `@zipframes/*` vem do GitHub Packages, na versão declarada no `package.json` do serviço.

| Pacote                     | Uso neste repositório           |
| -------------------------- | ------------------------------- |
| `@zipframes/core`          | `Result`, erros e readiness     |
| `@zipframes/http`          | `defineHandler` no auth-service |
| `@zipframes/schemas`       | contratos HTTP e de evento      |
| `@zipframes/value-objects` | e-mail e nome no cadastro       |
| `@zipframes/communication` | publicar e consumir no RabbitMQ |
| `@zipframes/logger`        | log e correlation id            |
| `@zipframes/telemetry`     | métricas Prometheus             |
| `@zipframes/authenticator` | só nos testes do auth           |
| `@zipframes/test-toolkit`  | testes de integração            |

## Como os processos se relacionam

O auth grava o usuário e publica `user.registered` no exchange `zipframes.events`. O worker não consome esse evento. Ele escuta a fila `processor.video.uploaded`, ligada a `video.uploaded`. Quem publicaria esse evento não está neste repositório.

Os dois não se chamam por HTTP na subida. O auth precisa do Postgres (`auth_db`) e do RabbitMQ. O worker precisa do RabbitMQ, do bucket `videos` e de `ffmpeg` no `PATH` quando roda fora da imagem. A ordem entre os dois processos não importa.

## Tecnologias presentes no código

- Node.js 26, TypeScript 5, pnpm 12.6.0
- Fastify, Zod, Prisma (só no auth)
- RabbitMQ (`amqplib`) e SeaweedFS pela API S3 (`@aws-sdk/client-s3`)
- JWT RS256 (`jose`) e senha com bcrypt
- Vitest. A integração sobe broker e storage com `@zipframes/test-toolkit` e precisa de Docker
- `GET /metrics` em texto Prometheus (`prom-client`)

Não há OpenTelemetry, Grafana, Jaeger, Redis client nem Nodemailer no código. O Compose sobe `video-db`, `notification-db`, Redis e Mailpit; nenhum processo daqui conecta neles.

## Pré-requisitos

- Node.js 26 (`.nvmrc` e `.node-version`). O Node 26.10 não traz o `corepack`.
- pnpm 12.6.0, o valor de `packageManager` na raiz e nos dois serviços:

```bash
npm install -g pnpm@12.6.0 --allow-scripts=pnpm
```

O npm 11 que vem com o Node 26 não executa o script de instalação do pnpm sem `--allow-scripts=pnpm`. A imagem do auth usa o mesmo comando.

- Docker, para a infra e para os testes de integração
- `ffmpeg` no `PATH`, se o worker rodar na máquina e não na imagem
- Token do GitHub com `read:packages` para `@zipframes/*`

O pnpm 12 não expande `${NODE_AUTH_TOKEN}` no `.npmrc` versionado. No `~/.npmrc`:

```
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

Exporte `NODE_AUTH_TOKEN` no shell antes de `pnpm install` dentro de cada serviço.

## Ambiente

Copie o exemplo para `.env` ao lado. O processo não lê o `.example`.

| Arquivo                                  | Quem lê                                                                                               |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `infra/docker-compose/.env.example`      | O Compose, em `infra/docker-compose/.env`. Os defaults do YAML repetem o exemplo; a cópia é opcional. |
| `services/auth-service/.env.example`     | `pnpm dev` e `pnpm start` do auth, via `--env-file=.env` no diretório do serviço.                     |
| `services/processor-worker/.env.example` | O mesmo, no worker.                                                                                   |

A chave de desenvolvimento está em `infra/docker-compose/auth/jwt-dev.pem`. O `.env` do auth aponta para ela com caminho relativo ao diretório do serviço. Use `pnpm --dir` a partir da raiz.

Credenciais locais, iguais no exemplo e em `infra/docker-compose/seaweedfs/s3.json`:

- Postgres `zipframes` / `zipframes`, banco `auth_db`, porta 5432
- RabbitMQ `zipframes` / `zipframes`, AMQP 5672, painel http://localhost:15672
- S3 access key `zipframes`, secret `zipframes-local-secret`, bucket `videos`, `http://localhost:8333`

`s3.json` não interpola variável. Se mudar a chave no `.env` do Compose, mude o JSON também. `JWT_KID` na máquina e no Compose é `auth-dev-1`. O ConfigMap de Kubernetes usa `auth-1`.

## Subir na máquina

```bash
cp services/auth-service/.env.example services/auth-service/.env
cp services/processor-worker/.env.example services/processor-worker/.env

pnpm install
pnpm --dir services/auth-service install
pnpm --dir services/processor-worker install

pnpm infra:up

pnpm --dir services/auth-service db:generate
pnpm --dir services/auth-service db:deploy
pnpm --dir services/auth-service dev
```

Em outro terminal:

```bash
pnpm --dir services/processor-worker dev
```

`pnpm infra:up` sobe só a infra. Não constrói imagem de serviço. `db:deploy` aplica a migration que já existe (`20260101000000_init`). `db:migrate` é `prisma migrate dev`, para mudar o schema, não para a primeira subida.

Conferir:

```bash
curl -fsS http://localhost:3000/health/ready
curl -fsS http://localhost:3000/.well-known/jwks.json
curl -fsS -X POST http://localhost:3000/register \
  -H 'content-type: application/json' \
  -d '{"name":"Ada Lovelace","email":"ada@example.com","password":"senha1234"}'

curl -fsS http://localhost:8081/health/ready
curl -fsS http://localhost:9333/cluster/healthz
```

A senha do exemplo tem letra e dígito, entre 8 e 72 caracteres. `GET /health/ready` do auth responde 200 com Postgres e RabbitMQ alcançáveis, e 503 com `reason` se um dos dois falhar. O do worker responde 200 com RabbitMQ e o bucket alcançáveis. `GET /health/live` só diz que o processo está de pé. `GET /docs` é o OpenAPI gerado. `GET /metrics` é o texto Prometheus.

Portas, Mailpit e o caminho em que os dois processos rodam dentro de container estão em [`infra/docker-compose/README.md`](infra/docker-compose/README.md).

## Testes

Na raiz: `pnpm format` e `pnpm lint`. Em cada serviço, `pnpm test:unit` não precisa de Docker. `pnpm test` roda a unidade e depois a integração, e a integração precisa de Docker. O teste de integração do worker usa o binário do `ffmpeg-static`, não o `ffmpeg` do sistema.

```bash
pnpm --dir services/auth-service test:unit
pnpm --dir services/processor-worker test:unit
```

## Build

Os pacotes `@zipframes/*` não são buildados neste repositório. Cada serviço:

```bash
pnpm --dir services/auth-service build
pnpm --dir services/processor-worker build
```

A imagem do worker não baixa dependência. Antes dela, `pnpm --dir services/processor-worker stage-runtime` copia os `node_modules` de produção para `.runtime/`. A imagem do auth instala o lockfile do serviço durante o build e exige `NODE_AUTH_TOKEN`.

## Limitações

- Não há fluxo de upload. O worker não recebe vídeo enquanto ninguém publicar `video.uploaded`.
- `infra/k8s/` não declara Postgres, RabbitMQ nem SeaweedFS. O Secret de exemplo não entra no Kustomize. O worker declara um `ScaledObject` do KEDA. Sem cluster, CRDs e imagens já carregadas, esses manifests não sobem o sistema.
- As imagens ficam locais. Os manifests do Argo CD apontam para `infra/k8s/` e não são um ambiente local pronto.
