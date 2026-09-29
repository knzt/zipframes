# @zipframes/notifier-service

Processo que consome eventos de identidade e de resultado de processamento e envia e-mail. Sem HTTP de negócio.

Arquitetura: [docs/architecture/services/notifier-service.md](../../docs/architecture/services/notifier-service.md). Quatro anéis em `src/` mais `main/` como composition root.

## Camadas

```
src/domain/               # Contact, Notification, NotificationAttempt, policies de e-mail
src/application/          # casos de uso e ports
src/interface-adapters/   # contacts/ e emails/, um controller AMQP por evento
src/infrastructure/       # Prisma, Nodemailer, S3 (só signGetUrl), AMQP
src/main/                 # start.ts e factories (sem handlers HTTP)
```

## O que faz

- projeta `user.registered` / `user.updated` / `user.deleted` na fila `notifier.contacts`
- consome `video.processed` e `video.failed` na fila `notifier.emails`
- retry pela fila wait com TTL (não republica em `zipframes.events`)
- e-mail de zip pronto: nome do arquivo, quantidade de frames, URL GET assinada (24h) e fallback `{APP_PUBLIC_URL}/videos/{videoId}/download`
- e-mail de falha: nome do arquivo, data do envio e `{APP_PUBLIC_URL}/videos` para enviar de novo
- sem anexo zip, sem Fastify; probes exec (`kill -0 1`)

## Testes

```
tests/unit          # unicidade por tipo, PENDING, drain, 3 tentativas, corpo do e-mail
tests/integration   # RabbitMQ, Postgres, Mailpit e SeaweedFS (sem mock)
```

`pnpm test` roda os dois. Integração sobe Postgres, RabbitMQ, S3 e Mailpit com `@zipframes/test-toolkit` e Testcontainers.

## Rodar local

`pnpm infra:up` sobe Postgres (`notification-db`), RabbitMQ, SeaweedFS e Mailpit. Não sobe este processo.

Da raiz, `pnpm deps:notifier pkgname@3.1` (e `-D`) adiciona dependência neste serviço.

```bash
cp services/notifier-service/.env.example services/notifier-service/.env
pnpm --dir services/notifier-service install
pnpm --dir services/notifier-service db:generate
pnpm --dir services/notifier-service db:deploy
pnpm infra:up
pnpm --dir services/notifier-service dev
```

O processo não escuta HTTP. O Compose e o Kubernetes usam probe exec (`kill -0 1`).

A imagem instala o lockfile no build (contexto = raiz do repositório) e aplica `prisma migrate deploy` na subida:

```bash
export NODE_AUTH_TOKEN
pnpm infra:apps
```

O lockfile deste serviço é `services/notifier-service/pnpm-lock.yaml`. `pnpm install` precisa de `NODE_AUTH_TOKEN` para os pacotes `@zipframes/*`. O pnpm 12 só expande esse token num `.npmrc` de usuário (`//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}`), não no arquivo versionado.

No cluster, o Argo CD aplica `infra/k8s/notifier-service`. O Secret de exemplo não entra nesse apply.
