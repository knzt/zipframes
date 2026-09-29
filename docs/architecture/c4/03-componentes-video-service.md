# C4 nível 3: componentes do video-service

O video-service por dentro: o caminho de uma requisição HTTP, de um evento do worker e da varredura de retenção. Os nomes nas caixas são os nomes das classes no código. As decisões por trás deste desenho estão em [video-service.md](../services/video-service.md).

```mermaid
flowchart TB
  ingress["<b>Ingress</b>"]
  authsvc["<b>auth-service</b><br/>JWKS"]
  brokerin[["<b>RabbitMQ</b><br/>eventos do worker<br/>e de identidade"]]
  timer(["<b>Agendador</b><br/>a cada minuto"])

  subgraph vs["video-service [Container]"]
    direction TB

    subgraph fwin["Frameworks & Drivers: entrada"]
      direction LR
      fastify["Servidor Fastify<br/>+ catálogo de rotas"]
      amqpin["Consumo AMQP"]
      interval["startIntervalJob"]
    end

    subgraph adin["Interface Adapters"]
      direction LR
      ctrl["UploadVideo, ListUserVideos,<br/>GetVideo, GetDownloadUrl,<br/>DeleteVideo<br/><i>Controllers</i>"]
      consumer["ApplyProcessingEvent<br/><i>Controller</i>"]
      consumer2["UserDeleted<br/><i>Controller</i>"]
    end

    subgraph app["Use Cases"]
      direction LR
      uc["UploadVideo<br/>ListUserVideos<br/>GetVideo<br/>GetDownloadUrl<br/>DeleteVideo<br/>ApplyProcessingEvent<br/>ExpireFramesPackages<br/>DeleteAccountVideos"]
      interfaces["<b>Interfaces</b><br/>VideoRepository<br/>EventPublisher<br/>ObjectStorage<br/>DownloadUrlSigner<br/>VideoListCache"]
    end

    subgraph dom["Entities"]
      direction LR
      video["Video<br/>(raiz do agregado)"]
      vos["VideoStatus, FileName, VideoFile,<br/>chaves de storage, VideoQueued"]
    end

    subgraph fwout["Frameworks & Drivers: saída"]
      direction LR
      repo["PrismaVideoRepository"]
      events["AmqpEventPublisherGateway"]
      objstore["S3ObjectStorageGateway"]
      signer["S3DownloadUrlSignerGateway"]
      listcache["RedisVideoListCacheGateway"]
    end
  end

  db[("<b>video-db</b>")]
  storage[("<b>SeaweedFS</b>")]
  cache[("<b>Redis</b>")]
  brokerout[["<b>RabbitMQ</b><br/>zipframes.events"]]

  ingress --> fastify
  brokerin --> amqpin
  timer --> interval
  fastify --> ctrl
  authsvc -. "chaves públicas<br/>(defineAuthenticatedHandler)" .-> ctrl
  authsvc -- "user.deleted" --> brokerin
  amqpin --> consumer
  amqpin --> consumer2
  interval --> uc
  ctrl --> uc
  consumer --> uc
  consumer2 --> uc
  uc --> video
  video --- vos
  uc --> interfaces
  interfaces -. "implementadas por" .-> fwout
  repo --> db
  objstore --> storage
  listcache --> cache
  events --> brokerout

  classDef ext fill:#8a8a8a,stroke:#5e5e5e,color:#ffffff
  classDef fwc fill:#dbe7f5,stroke:#5f86b8,color:#1b2a3a
  classDef adc fill:#cfe8dc,stroke:#4e9373,color:#15291f
  classDef appc fill:#f7e3c4,stroke:#c28a2e,color:#2e2210
  classDef domc fill:#f3d0d0,stroke:#b35c5c,color:#2e1515
  class ingress,authsvc,brokerin,timer,db,storage,cache,brokerout ext
  class fastify,amqpin,interval,repo,events,objstore,signer,listcache fwc
  class ctrl,consumer,consumer2 adc
  class uc,interfaces appc
  class video,vos domc
```

O diagrama segue o caminho em tempo de execução: entra pelos frameworks (HTTP, fila ou relógio), passa pelos controllers, chega aos casos de uso e às entidades, e sai pelas interfaces que o caso de uso declara até as classes que as implementam. O RabbitMQ aparece duas vezes apenas para separar consumo e publicação. O agendador da expiração chama o caso de uso direto: não há controller, porque não há entrada externa a validar.

A idempotência do consumo vem da máquina de estados do `Video`: um evento repetido ou atrasado encontra o vídeo num estado que não aceita aquela transição e é descartado. Por isso o serviço dispensa uma tabela de eventos processados (detalhes em [modelagem de dados](../../data/modelagem-de-dados.md)). O domínio gera o id do vídeo e o caso de uso lê o relógio direto; os testes controlam o tempo com os fake timers do Vitest.

`DeleteAccountVideos` é idempotente de outro jeito: um `user.deleted` repetido encontra os vídeos já apagados, e apagar um objeto ou uma linha que já não existe é inofensivo.

## Componentes

| Camada               | Componente                                             | Responsabilidade                                                                                                                                |
| -------------------- | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Entities             | `Video`                                                | Mantém o estado do vídeo e aplica as regras de transição, de retenção e de download                                                             |
| Entities             | `FileName`, `VideoFile`, `VideoStatus`, chaves         | Validam o nome e a extensão, enumeram os status e derivam `sourceKey` e `resultKey`                                                             |
| Use Cases            | `UploadVideo`                                          | Valida nome e tipo, grava o arquivo em stream, valida o tamanho, grava `QUEUED` e publica `video.uploaded`; se o broker recusar, marca `FAILED` |
| Use Cases            | `ListUserVideos` e `GetVideo`                          | Consultam os vídeos do dono; a listagem usa o cache na primeira página                                                                          |
| Use Cases            | `GetDownloadUrl`                                       | Verifica se o pacote está disponível e devolve a URL do zip                                                                                     |
| Use Cases            | `DeleteVideo`                                          | Apaga os arquivos e marca o vídeo `DELETED`                                                                                                     |
| Use Cases            | `ApplyProcessingEvent`                                 | Aplica os eventos do worker de forma idempotente e invalida o cache                                                                             |
| Use Cases            | `ExpireFramesPackages`                                 | Apaga os pacotes vencidos e marca os vídeos `EXPIRED`                                                                                           |
| Use Cases            | `DeleteAccountVideos`                                  | Ao consumir `user.deleted`, apaga todos os vídeos e arquivos do dono, em qualquer status                                                        |
| Use Cases            | Interfaces                                             | Declaradas pelos casos de uso em `application/interfaces/`                                                                                      |
| Interface Adapters   | Controllers HTTP                                       | `defineAuthenticatedHandler`: validam o token (JWKS), a entrada e traduzem o `Result` em resposta                                               |
| Interface Adapters   | `ApplyProcessingEventController`                       | `defineMessageHandler`: valida o envelope contra os três eventos do worker e chama o caso de uso                                                |
| Interface Adapters   | `UserDeletedController`                                | `defineMessageHandler`: valida o envelope de `user.deleted` e chama `DeleteAccountVideos`                                                       |
| Frameworks & Drivers | `PrismaVideoRepository`                                | Um `save` que insere (versão 1) ou atualiza com lock otimista (`UPDATE ... WHERE version = $1`)                                                 |
| Frameworks & Drivers | `AmqpEventPublisherGateway`                            | Monta o envelope e publica no exchange `zipframes.events` com confirmação do broker                                                             |
| Frameworks & Drivers | `S3ObjectStorageGateway`, `S3DownloadUrlSignerGateway` | Upload multipart em stream e exclusão de objetos; assinatura da URL de download com o endpoint público                                          |
| Frameworks & Drivers | `RedisVideoListCacheGateway`                           | Cache-aside que degrada para miss quando o Redis cai                                                                                            |

O composition root (`main/`) não aparece no diagrama: ele lê a configuração, abre os clientes uma vez e os injeta pelas factories nos casos de uso e controllers.
