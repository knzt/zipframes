# video-service

Ciclo de vida dos vídeos do ZipFrames: envio, status, listagem, download, expiração e exclusão.

O vídeo chega em um único `POST /videos` (multipart) e vai em stream para o storage; o zip sai direto do storage por uma URL pré-assinada de curta duração. Aqui ficam os metadados e a máquina de estados do vídeo. O dono de cada vídeo é o `sub` do token emitido pelo auth-service, validado localmente contra o JWKS dele. O processamento acontece no processor-worker: este serviço publica `video.uploaded` e consome `video.processing.started`, `video.processed` e `video.failed`. Também consome `user.deleted` do auth-service, para apagar os vídeos e arquivos de uma conta excluída.

O contrato HTTP é o documento gerado em `GET /docs` (as rotas comuns de saúde e documentação estão em [`docs/architecture/README.md`](../../docs/architecture/README.md#http)). Os eventos estão em [`docs/asyncapi/events.yaml`](../../docs/asyncapi/events.yaml). A arquitetura interna está em [`docs/architecture/services/video-service.md`](../../docs/architecture/services/video-service.md).

## Camadas

```
src/
├── domain/                 # Video (agregado e máquina de estados), VideoStatus, chaves de objeto
├── application/
│   ├── useCases/           # UploadVideo, ListUserVideos, GetVideo, GetDownloadUrl, DeleteVideo,
│   │                       # ApplyProcessingEvent, ExpireFramesPackages, DeleteAccountVideos
│   └── interfaces/         # VideoRepository, EventPublisher, ObjectStorage, DownloadUrlSigner, VideoListCache
├── interface-adapters/     # controllers HTTP e os controllers dos eventos consumidos
├── infrastructure/
│   ├── http/               # catálogo de rotas; Fastify em http/fastify/
│   ├── repositories/prisma/
│   ├── gateways/           # AMQP, S3 (upload, exclusão e assinatura do download), Redis
│   ├── messaging/amqplib/  # conexão, topologia e settle
│   ├── observability/
│   └── scheduling/         # varredura periódica de expiração
└── main/                   # start.ts, factories
```

```
tests/
├── unit/                   # domínio, casos de uso, HTTP por inject, gateways
├── integration/            # o processo real (startVideoService) contra Postgres, RabbitMQ,
│                           # SeaweedFS e Redis em Testcontainers; o adapter Prisma à parte
└── support/                # fakes das interfaces e builders de vídeo
```

As regras de dependência entre as pastas de `src/` estão em [`docs/architecture/README.md`](../../docs/architecture/README.md#organização-de-cada-serviço) e são verificadas no CI pelo dependency-cruiser.

## Rotas

| Método e path                     | O que faz                                                                 |
| --------------------------------- | ------------------------------------------------------------------------- |
| `POST /videos`                    | Recebe o arquivo (multipart, campo `file`) e o põe na fila                |
| `GET /videos?limit&before&status` | Vídeos do usuário, mais recentes primeiro, com filtro opcional por status |
| `GET /videos/{videoId}`           | Um vídeo: status, frames extraídos, motivo da falha e validade do zip     |
| `GET /videos/{videoId}/download`  | URL do zip (5 min); 409 se não está pronto, 410 se expirou                |
| `DELETE /videos/{videoId}`        | Apaga os arquivos e mantém o histórico mínimo                             |

Todas exigem `Authorization: Bearer <token>` de `POST /login` no auth-service.

## Desenvolvimento

O serviço tem o próprio lockfile. Os pacotes `@zipframes/*` vêm do GitHub Packages. O pnpm 12 não expande `${NODE_AUTH_TOKEN}` no `.npmrc` versionado; a linha `//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}` fica no `~/.npmrc`.

`pnpm dev` e `pnpm start` leem `services/video-service/.env`. O auth-service precisa estar no ar para os tokens serem validados (o JWKS é buscado no primeiro uso), e `JWT_ISSUER`/`JWT_AUDIENCE` precisam ser os mesmos dele. `S3_PUBLIC_ENDPOINT` é o endereço do storage que o cliente alcança para baixar o zip; na máquina, é o mesmo de `S3_ENDPOINT`.

O schema do banco mudou com o upload em uma chamada (sem `AWAITING_UPLOAD` e sem as colunas de purga), e a migration inicial foi reescrita. Um `video_db` local criado antes disso precisa ser recriado: `pnpm infra:reset` e depois `db:deploy`.

Da raiz, `pnpm deps:video pkgname@3.1` (e `-D`) adiciona dependência neste serviço.

```bash
export NODE_AUTH_TOKEN=<seu token>
cp services/video-service/.env.example services/video-service/.env
pnpm --dir services/video-service install
pnpm infra:up
pnpm --dir services/video-service db:generate
pnpm --dir services/video-service db:deploy
pnpm --dir services/video-service dev
```

O fluxo completo com `curl` está no [README da raiz](../../README.md#o-fluxo-completo). A imagem e o processo no Compose estão descritos em [`infra/docker-compose/README.md`](../../infra/docker-compose/README.md).
