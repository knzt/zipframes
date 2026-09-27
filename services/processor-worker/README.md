# @zipframes/processor-worker

Worker stateless que consome `video.uploaded`, extrai frames com `ffmpeg` e publica o resultado.

Arquitetura: [docs/architecture/services/processor-worker.md](../../docs/architecture/services/processor-worker.md). Quatro anéis em `src/` mais `main/` como composition root.

## Camadas

```
src/domain/               # Value objects, policies, erros
src/application/          # casos de uso e ports
src/interface-adapters/   # controller da mensagem
src/infrastructure/       # implementações e consumer AMQP (messaging/amqplib)
src/main/                 # start.ts e factories (sem handlers HTTP)
```

## O que faz

- consome `video.uploaded` da fila `processor.video.uploaded` (retry via fila wait com TTL)
- baixa o original do storage (stream), extrai 1 frame/s em PNG e gera um zip (store)
- publica `video.processing.started`, `video.processed` ou `video.failed`
- apaga o original ao terminar (sucesso ou falha permanente); falha no delete vira log/métrica
- **sem HTTP, sem banco próprio**

## Testes

```
tests/unit          # contratos e regras; dependências substituídas
tests/integration   # fluxo de video.uploaded contra RabbitMQ e SeaweedFS (sem mock)
```

`pnpm test` roda os dois. Integração sobe RabbitMQ e S3 com `@zipframes/test-toolkit` (Docker) e usa o binário do `ffmpeg-static`.

## Rodar local

`pnpm infra:up` sobe RabbitMQ e o SeaweedFS. Não sobe este processo. Na máquina, com `ffmpeg` no `PATH`, `pnpm dev` lê `services/processor-worker/.env`:

`pnpm --dir services/processor-worker` e, da raiz, `pnpm pnpm:worker` fazem a mesma coisa. `pnpm deps:worker pkgname@3.1` (e `-D`) adiciona dependência neste serviço.

```bash
cp services/processor-worker/.env.example services/processor-worker/.env
pnpm pnpm:worker install
pnpm infra:up
pnpm pnpm:worker dev
```

O processo não escuta HTTP. O Compose e o Kubernetes usam probe exec (`kill -0 1`).

Para a imagem, o contexto precisa de `dist/` e de `.runtime/node_modules` antes do build:

```bash
pnpm pnpm:worker build
pnpm pnpm:worker stage-runtime
pnpm infra:apps
```

O lockfile deste serviço é `services/processor-worker/pnpm-lock.yaml`. `pnpm install` precisa de `NODE_AUTH_TOKEN` para os pacotes `@zipframes/*`. O pnpm 12 só expande esse token num `.npmrc` de usuário (`//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}`), não no arquivo versionado.

No cluster, o Argo CD aplica `infra/k8s/processor-worker`. O Secret de exemplo não entra nesse apply.
