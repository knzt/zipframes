# C4 nível 2: containers

Abre o sistema e mostra as aplicações e os armazenamentos que o compõem, com as tecnologias e os protocolos de comunicação.

```mermaid
flowchart TB
  user["<b>Usuário</b><br/><i>[Pessoa]</i>"]
  smtp["<b>Servidor de e-mail</b><br/><i>[Sistema externo]</i>"]

  subgraph zipframes["ZipFrames [Sistema]"]
    web["<b>web-client</b><br/><i>[Container: SPA estática]</i><br/>Login, upload, status e download"]
    ingress["<b>Ingress</b><br/><i>[Container: NGINX Ingress]</i><br/>Ponto único de entrada"]
    auth["<b>auth-service</b><br/><i>[Container: Node.js, Fastify]</i><br/>Cadastro, login e JWT"]
    video["<b>video-service</b><br/><i>[Container: Node.js, Fastify]</i><br/>Ciclo de vida dos vídeos,<br/>URLs pré-assinadas e listagem"]
    worker["<b>processor-worker</b><br/><i>[Container: Node.js, Fastify, ffmpeg]</i><br/>Extrai os frames e gera o zip"]
    notif["<b>notification-service</b><br/><i>[Container: Node.js]</i><br/>Envia notificações de falha"]
    broker[["<b>RabbitMQ</b><br/><i>[Container: message broker]</i><br/>Exchange zipframes.events"]]
    authdb[("<b>auth-db</b><br/><i>[PostgreSQL]</i><br/>Usuários")]
    videodb[("<b>video-db</b><br/><i>[PostgreSQL]</i><br/>Vídeos")]
    notifdb[("<b>notification-db</b><br/><i>[PostgreSQL]</i><br/>Contatos e notificações")]
    cache[("<b>Redis</b><br/><i>[Cache]</i><br/>Listagem por usuário")]
    storage[("<b>SeaweedFS</b><br/><i>[Object storage, API S3]</i><br/>Vídeos originais e zips")]
  end

  user -- "Usa<br/>[HTTPS]" --> ingress
  ingress -- "Entrega a interface" --> web
  ingress -- "/auth<br/>[HTTP/JSON]" --> auth
  ingress -- "/videos<br/>[HTTP/JSON]" --> video
  ingress -- "Upload e download com<br/>URL pré-assinada [S3]" --> storage

  video -- "Obtém as chaves públicas<br/>[HTTP, JWKS]" --> auth
  auth -- "Lê e grava<br/>[SQL]" --> authdb
  video -- "Lê e grava<br/>[SQL]" --> videodb
  notif -- "Lê e grava<br/>[SQL]" --> notifdb
  video -- "Cache-aside<br/>[RESP]" --> cache
  video -- "Assina URLs e confere objetos<br/>[S3]" --> storage
  worker -- "Baixa o vídeo e grava o zip<br/>[S3]" --> storage

  auth -- "Publica user.registered<br/>[AMQP]" --> broker
  video <-- "Publica video.uploaded e consome<br/>started, processed e failed [AMQP]" --> broker
  broker -- "Entrega video.uploaded<br/>[AMQP]" --> worker
  worker -- "Publica started,<br/>processed e failed [AMQP]" --> broker
  broker -- "Entrega user.registered<br/>e video.failed [AMQP]" --> notif
  notif -- "Envia e-mail<br/>[SMTP]" --> smtp

  classDef person fill:#08427b,stroke:#052e56,color:#ffffff
  classDef container fill:#438dd5,stroke:#2e6295,color:#ffffff
  classDef store fill:#2f6fa8,stroke:#1f4d78,color:#ffffff
  classDef external fill:#8a8a8a,stroke:#5e5e5e,color:#ffffff
  class user person
  class web,ingress,auth,video,worker,notif container
  class broker,authdb,videodb,notifdb,cache,storage store
  class smtp external
```

A interface roda no navegador do usuário, então as chamadas à API e ao storage partem do navegador e passam pelo Ingress.

## Containers

| Container                          | Tecnologia                              | Responsabilidade                                               | Escala                            |
| ---------------------------------- | --------------------------------------- | -------------------------------------------------------------- | --------------------------------- |
| web-client                         | SPA estática                            | Interface do usuário                                           | Réplicas fixas                    |
| Ingress                            | NGINX Ingress Controller                | Roteamento, TLS e exposição do storage para URLs pré-assinadas | Gerenciado pelo cluster           |
| auth-service                       | Node.js, TypeScript, Fastify, Prisma    | Identidade e emissão de tokens                                 | HPA por CPU                       |
| video-service                      | Node.js, TypeScript, Fastify, Prisma    | Gestão de vídeos                                               | HPA por CPU                       |
| processor-worker                   | Node.js, TypeScript, ffmpeg             | Processamento                                                  | KEDA pelo tamanho da fila         |
| notification-service               | Node.js, TypeScript, Nodemailer, Prisma | Notificações                                                   | Réplicas fixas                    |
| RabbitMQ                           | RabbitMQ Cluster Operator               | Transporte dos eventos                                         | Cluster do operator               |
| auth-db, video-db, notification-db | PostgreSQL com CloudNativePG            | Persistência de cada serviço                                   | Instância por serviço             |
| Redis                              | Redis                                   | Cache da listagem                                              | Instância única                   |
| SeaweedFS                          | SeaweedFS com gateway S3                | Armazenamento de arquivos                                      | Instância única no ambiente local |

## Infraestrutura de suporte

Fora do fluxo de negócio, o cluster também executa Prometheus, Grafana e Jaeger (observabilidade), KEDA (escala do worker) e Argo CD (entrega contínua). Eles não aparecem no diagrama para manter o foco nos containers do sistema.
