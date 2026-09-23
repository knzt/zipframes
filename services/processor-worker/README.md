# @zipframes/processor-worker

Worker stateless que consome `video.uploaded`, extrai frames com `ffmpeg` e publica o resultado.

Arquitetura: Clean Architecture (Uncle Bob) — ver [docs/architecture/services/processor-worker.md](../../docs/architecture/services/processor-worker.md).

## Camadas

```
src/domain/            # Value objects, policies, erros
src/application/       # Use cases + ports (gateways/services)
src/infrastructure/    # Consumers, gateways, services, health HTTP
src/main/              # Composition root
```

## O que faz

- consome `video.uploaded` da fila `processor.video.uploaded` (retry via fila wait com TTL)
- baixa o original do storage (stream), extrai 1 frame/s em PNG e gera um zip (store)
- publica `video.processing.started`, `video.processed` ou `video.failed`
- apaga o original ao terminar (sucesso ou falha permanente); falha no delete vira log/métrica
- health unificado na mesma porta: `GET /health/live`, `GET /health/ready`, `GET /metrics`
- **sem banco próprio**

## Testes

```
tests/unit   # contratos e regras; dependências substituídas
tests/int    # filesystem, HTTP, ffmpeg, RabbitMQ e S3 reais (sem mock)
```

`pnpm test` roda os dois. Integração sobe RabbitMQ e SeaweedFS via Testcontainers (Docker) e usa o binário do `ffmpeg-static`.

## Rodar local

Infraestrutura e o worker, na rede Docker:

```bash
cp infra/docker-compose/.env.example infra/docker-compose/.env
pnpm --dir services/processor-worker build
pnpm --dir services/processor-worker stage-runtime
pnpm infra:up
```

`GET http://localhost:8081/health/ready` responde 200 quando o processo alcança o RabbitMQ e o bucket.

Fora do container, com `ffmpeg` no PATH:

```bash
cp services/processor-worker/.env.example services/processor-worker/.env
cd services/processor-worker
pnpm install
pnpm dev
```

O lockfile deste serviço é `services/processor-worker/pnpm-lock.yaml`. `pnpm install` precisa de `NODE_AUTH_TOKEN` para os pacotes `@zipframes/*` (exceto `@zipframes/core`, linkado via `file:`).

No cluster, o Argo CD aplica `infra/k8s/processor-worker`. O Secret de exemplo não entra nesse apply.
