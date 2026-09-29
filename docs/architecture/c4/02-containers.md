# C4 nível 2: containers

As aplicações e os armazenamentos que formam o ZipFrames, com a tecnologia de cada um e como eles conversam.

```mermaid
flowchart TB
  user["<b>Usuário</b><br/><i>[Pessoa]</i><br/>Usa a API por um cliente HTTP"]
  smtp["<b>Servidor de e-mail</b><br/><i>[Sistema externo]</i>"]

  subgraph zipframes["ZipFrames [Sistema]"]
    ingress["<b>Ingress</b><br/><i>[Container: Traefik]</i><br/>Entrada por host"]
    auth["<b>auth-service</b><br/><i>[Container: Node.js, Fastify]</i><br/>Cadastro, login e JWT"]
    video["<b>video-service</b><br/><i>[Container: Node.js, Fastify]</i><br/>Upload, status, listagem,<br/>download e retenção"]
    worker["<b>processor-worker</b><br/><i>[Container: Node.js, ffmpeg]</i><br/>Extrai os frames e gera o zip"]
    notif["<b>notifier-service</b><br/><i>[Container: Node.js, Nodemailer]</i><br/>E-mails de resultado e de falha"]
    broker[["<b>RabbitMQ</b><br/><i>[Container: message broker]</i><br/>Exchange zipframes.events"]]
    authdb[("<b>auth-db</b><br/><i>[PostgreSQL]</i><br/>Usuários")]
    videodb[("<b>video-db</b><br/><i>[PostgreSQL]</i><br/>Vídeos")]
    notifdb[("<b>notification-db</b><br/><i>[PostgreSQL]</i><br/>Contatos e notificações")]
    cache[("<b>Redis</b><br/><i>[Cache]</i><br/>Listagem por usuário")]
    storage[("<b>SeaweedFS</b><br/><i>[Object storage, API S3]</i><br/>Vídeos originais e zips")]
  end

  user -- "auth.* e api.*<br/>[HTTP/JSON, multipart]" --> ingress
  user -- "Baixa o zip pela URL assinada<br/>storage.* [HTTP]" --> ingress
  ingress --> auth
  ingress --> video
  ingress --> storage

  video -- "Busca as chaves públicas<br/>[HTTP, JWKS]" --> auth
  auth -- "[SQL]" --> authdb
  video -- "[SQL]" --> videodb
  notif -- "[SQL]" --> notifdb
  video -- "Cache-aside<br/>[RESP]" --> cache
  video -- "Grava o vídeo e apaga<br/>na retenção [S3]" --> storage
  worker -- "Baixa o vídeo e grava o zip<br/>[S3]" --> storage

  auth -- "user.registered<br/>[AMQP]" --> broker
  video -- "video.uploaded<br/>[AMQP]" --> broker
  broker -- "started, processed, failed<br/>[AMQP]" --> video
  broker -- "video.uploaded<br/>[AMQP]" --> worker
  worker -- "started, processed, failed<br/>[AMQP]" --> broker
  broker -- "user.*, video.processed,<br/>video.failed [AMQP]" --> notif
  notif -- "[SMTP]" --> smtp

  classDef person fill:#08427b,stroke:#052e56,color:#ffffff
  classDef container fill:#438dd5,stroke:#2e6295,color:#ffffff
  classDef store fill:#2f6fa8,stroke:#1f4d78,color:#ffffff
  classDef external fill:#8a8a8a,stroke:#5e5e5e,color:#ffffff
  class user person
  class ingress,auth,video,worker,notif container
  class broker,authdb,videodb,notifdb,cache,storage store
  class smtp external
```

Não há interface web. O usuário usa a API com qualquer cliente HTTP (curl, a Swagger UI em `/docs` dos dois serviços HTTP, ou um front-end futuro).

O Ingress separa por host: `auth.zipframes.localhost` vai para o auth-service, `api.zipframes.localhost` para o video-service e `storage.zipframes.localhost` para o SeaweedFS. O storage só é exposto para o download: o video-service assina a URL do zip com esse host público, e o navegador baixa o arquivo direto do storage, sem passar pelo serviço. O upload, ao contrário, passa pelo video-service, que grava o arquivo em stream.

Nenhum serviço lê o banco de outro. O que um contexto precisa saber do outro chega por evento: o notifier-service mantém uma cópia própria dos contatos a partir de `user.registered`, por exemplo.

## Containers

| Container                          | Tecnologia                              | Responsabilidade                     | Escala                    |
| ---------------------------------- | --------------------------------------- | ------------------------------------ | ------------------------- |
| Ingress                            | Traefik                                 | Roteamento por host                  | Uma réplica no kind       |
| auth-service                       | Node.js, TypeScript, Fastify, Prisma    | Identidade e emissão de tokens       | HPA por CPU (1 a 3)       |
| video-service                      | Node.js, TypeScript, Fastify, Prisma    | Ciclo de vida do vídeo               | HPA por CPU (1 a 3)       |
| processor-worker                   | Node.js, TypeScript, ffmpeg             | Processamento                        | KEDA pela fila (1 a 5)    |
| notifier-service                   | Node.js, TypeScript, Nodemailer, Prisma | Notificações por e-mail              | Réplica fixa              |
| RabbitMQ                           | RabbitMQ Cluster Operator               | Transporte dos eventos               | Uma réplica no kind       |
| auth-db, video-db, notification-db | PostgreSQL com CloudNativePG            | Um banco por serviço                 | Uma instância por cluster |
| Redis                              | Redis                                   | Cache da primeira página da listagem | Instância única           |
| SeaweedFS                          | SeaweedFS com gateway S3                | Vídeos originais e zips              | Instância única           |

## Fora do diagrama

O cluster também roda o que sustenta os containers acima, mas não participa do fluxo de negócio: os operators (CloudNativePG, RabbitMQ Cluster Operator e cert-manager), o KEDA, o metrics-server que alimenta os HPAs e o Argo CD. Como tudo isso sobe está em [infra/kind/README.md](../../../infra/kind/README.md).

Os serviços HTTP expõem `GET /metrics` no formato Prometheus, mas o cluster ainda não tem Prometheus nem Grafana coletando essas métricas.
