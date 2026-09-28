# Arquitetura: notification-service

Arquitetura do contexto de **Notificação** do ZipFrames. A Clean Architecture é a base; o mapa de pastas está em [layers.md](../layers.md).

Referências: [dominio.md — Notificação](../../domain/dominio.md), [AsyncAPI](../../asyncapi/events.yaml), [modelagem de dados](../../data/modelagem-de-dados.md), [regras de camadas](../layers.md).

## Objetivo do serviço

Consumir `user.registered`, `user.updated`, `user.deleted`, `video.processed` e `video.failed`, projetar o contato e enviar e-mail. `VIDEO_PROCESSED` avisa que o zip está pronto (nome do arquivo, quantidade de frames, URL GET assinada no endpoint público do S3, fallback `{APP_PUBLIC_URL}/videos/{videoId}/download` se o link falhar, e que o arquivo expira em 24 horas). `VIDEO_FAILED` avisa a falha (nome do arquivo, data do envio e `{APP_PUBLIC_URL}/videos` para enviar de novo). SMTP fica neste processo (Nodemailer). Os outros serviços disparam esses e-mails só publicando eventos, via `createNotifier` de `@zipframes/communication`. Sem Fastify, sem anexo zip, sem tabela `processed_events`.

## Camadas

As dependências apontam para dentro. Os quatro anéis e o composition root estão em [layers.md](../layers.md).

`NotificationEventsConsumer.handle` é o handler que `amqp.consume` recebe. Ele olha `eventType` e delega a um controller por mensagem. Cada controller usa `defineMessageHandler` de `@zipframes/communication`, que valida o envelope, faz ack, retry ou dead-letter e manda o poison para a DLQ. O caso de uso chama `ContactRepository`, `NotificationRepository`, `MailGateway` e `ObjectStorage` (`signGetUrl`). `start.ts` abre Prisma, AMQP, Nodemailer e um cliente S3 no endpoint público, chama `createNotificationEventsConsumer({ prisma, mail, smtpFrom, publicS3, bucket, appPublicUrl, downloadTtlSeconds, maxAttempts, handlerOptions })` e dá `amqp.consume(NOTIFICATION_QUEUE, consumer.handle, { retry, waitQueue: NOTIFICATION_RETRY_QUEUE })`. `handlerOptions` leva `retry`, `runInContext` (correlation id) e `onOutcome` (`recordNotificationOutcome` em `infrastructure/observability/notificationOutcome.ts`). A factory do consumer chama as dos controllers, e cada uma chama a do caso de uso, que instancia repositórios e gateways. Não há `handlers/` HTTP. O caso de uso não importa Prisma, Nodemailer nem o SDK da AWS.

```
main  →  interface-adapters / infrastructure  →  application  →  domain
```

| Pasta                     | Neste projeto        | Conteúdo                                                             |
| ------------------------- | -------------------- | -------------------------------------------------------------------- |
| `src/domain/`             | Entidades            | `Contact`, `Notification`, `NotificationAttempt`, policies de e-mail |
| `src/application/`        | Casos de uso e ports | Envio de e-mail, upsert/delete de contato, notify processed/failed   |
| `src/interface-adapters/` | Controllers          | Um controller AMQP por evento                                        |
| `src/infrastructure/`     | Drivers              | Prisma, Nodemailer, S3 (só assinar GET), AMQP, consumer              |
| `src/main/`               | Composition root     | `index.ts`, `start.ts`, `factories/`                                 |

### Gateway

| Categoria       | Neste serviço                                 |
| --------------- | --------------------------------------------- |
| `gateways/`     | `MailGateway`, `ObjectStorage` (`signGetUrl`) |
| `repositories/` | `ContactRepository`, `NotificationRepository` |

Probes de Compose e Kubernetes são exec (`kill -0 1`), não HTTP.

## Mapa de pastas

```
notification-service/src/
├── domain/
│   ├── entities/{contact,notification,notificationAttempt}.ts
│   ├── policies/notificationMail.ts
│   └── index.ts
├── application/
│   ├── useCases/{sendNotificationEmail,upsertContact,deleteContact,notifyVideoProcessed,notifyVideoFailed}/
│   └── interfaces/{repositories,gateways}/
├── interface-adapters/
│   ├── UserRegisteredController.ts
│   ├── UserUpdatedController.ts
│   ├── UserDeletedController.ts
│   ├── VideoProcessedController.ts
│   └── VideoFailedController.ts
├── infrastructure/
│   ├── repositories/prisma/
│   ├── gateways/{mail,storage}/
│   ├── messaging/amqplib/{connection,amqpTopology,notificationEventsConsumer,amqpSettle}.ts
│   ├── observability/notificationOutcome.ts
│   └── loadEnvConfig.ts
└── main/
    ├── index.ts
    ├── start.ts
    └── factories/{externals,repositories,gateways,use-cases,controllers,messaging}/
```

`amqpTopology.ts` declara a fila, o retry por TTL (sem republicar em `zipframes.events`) e a DLX compartilhada, no mesmo padrão do processor-worker. `@zipframes/communication` só entra com `createNotifier` (publicação tipada) e `defineMessageHandler`.

## Casos de uso

| Caso de uso                    | Orquestra                                                                           |
| ------------------------------ | ----------------------------------------------------------------------------------- |
| `NotifyVideoProcessedUseCase`  | Cria `VIDEO_PROCESSED` (única por vídeo) e envia o e-mail PENDING                   |
| `NotifyVideoFailedUseCase`     | Cria `VIDEO_FAILED` (única por vídeo) e envia o e-mail PENDING                      |
| `SendNotificationEmailUseCase` | PENDING se o contato falta; SMTP; até 3 tentativas só em falha SMTP; SENT ou FAILED |
| `UpsertContactUseCase`         | Grava o contato e drena notificações PENDING                                        |
| `DeleteContactUseCase`         | Apaga contato e histórico                                                           |

`ownerId` ausente em `video.processed` é ignorado. Tentativas SMTP entram em `notification_attempts`. Reentrega de um evento já `SENT`/`FAILED` é no-op.

## Mensageria

Fila própria `notification-service.events` + `notification-service.events.retry`. Retry devolve a mensagem **direto para a fila principal** pelo exchange default (`''`), e não para `zipframes.events`. Republicar no exchange compartilhado entregaria `video.failed` / identidade de novo a todo assinante a cada retry. Falha permanente usa o DLX compartilhado `zipframes.events.dlx` / `zipframes.events.dlq`.

Bindings: `user.registered`, `user.updated`, `user.deleted`, `video.processed`, `video.failed`.

## Persistência

Postgres (`notification-db`). Schema em `src/infrastructure/repositories/prisma/`. Unique `(video_id, type)`. Sem `processed_events`. Falhas SMTP ficam só em `notification_attempts`; `status = FAILED` na linha principal é o esgotamento dessas tentativas. O motivo do processamento não é persistido.

## Testes

| Pasta               | O que prova                                                                          |
| ------------------- | ------------------------------------------------------------------------------------ |
| `tests/unit`        | Unicidade por tipo, PENDING, drain, 3 tentativas, corpo do e-mail com URL e fallback |
| `tests/integration` | Fluxo contra RabbitMQ, Postgres, Mailpit e SeaweedFS; retry sem fan-out              |

Cobertura mínima no `src/` executável: 80%.

## Fora de escopo deste serviço

- HTTP de negócio / JWT / health HTTP
- PATCH/DELETE no auth-service
- Anexo zip no e-mail
- Cliente web
