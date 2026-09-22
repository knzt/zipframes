# @zipframes/processor-worker

Worker stateless que consome `video.uploaded`, extrai frames com `ffmpeg` e publica o resultado.

Arquitetura: Clean Architecture (Uncle Bob) — ver [docs/architecture/services/processor-worker.md](../../docs/architecture/services/processor-worker.md).

## Camadas

```
src/domain/            # Entities
src/application/       # Use cases + gateway interfaces
src/infrastructure/    # Consumers, gateway implementations, drivers
src/main/              # Composition root
```

## O que faz

- consome `video.uploaded` da fila `processor.video.uploaded` (retry via fila wait com TTL)
- baixa o original do storage (stream), extrai 1 frame/s em PNG e gera um zip (store)
- publica `video.processing.started`, `video.processed` ou `video.failed`
- apaga o original ao terminar (sucesso ou falha permanente); falha no delete vira log/métrica
- health (`/livez`, `/readyz`) e métricas Prometheus
- **sem banco próprio**

## Rodar local

```bash
pnpm infra:up
cp services/processor-worker/.env.example services/processor-worker/.env
cd services/processor-worker
pnpm install
pnpm dev
```

Requer `ffmpeg` no PATH e `NODE_AUTH_TOKEN` para instalar `@zipframes/*` do GitHub Packages. O lockfile deste serviço é `services/processor-worker/pnpm-lock.yaml` — `pnpm i` aqui não sobe para a raiz.

Imagem Docker (contexto = esta pasta):

```bash
docker build -t zipframes-processor-worker --build-arg NODE_AUTH_TOKEN .
```
