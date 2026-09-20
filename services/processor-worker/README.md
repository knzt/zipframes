# @zipframes/processor-worker

Worker stateless que consome `video.uploaded`, extrai frames com `ffmpeg` e publica o resultado.

## O que faz

- consome `video.uploaded` da fila `processor.video.uploaded`
- baixa o original do storage, extrai 1 frame/s em PNG e gera um zip (store)
- publica `video.processing.started`, `video.processed` ou `video.failed`
- apaga o original ao terminar (sucesso ou falha permanente)
- **sem banco próprio** — estado vem da mensagem e do storage

## Rodar local

```bash
pnpm infra:up
cp services/processor-worker/.env.example services/processor-worker/.env
pnpm --filter @zipframes/processor-worker dev
```

Requer `ffmpeg` no PATH e `NODE_AUTH_TOKEN` para instalar `@zipframes/*` do GitHub Packages.
