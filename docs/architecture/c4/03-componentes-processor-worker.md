# C4 nível 3: componentes do processor-worker

O processor-worker por dentro: o caminho de uma mensagem `video.uploaded` até o zip gravado e o evento de resultado publicado. Os nomes nas caixas são os nomes das classes no código. As decisões por trás deste desenho estão em [processor-worker.md](../services/processor-worker.md).

```mermaid
flowchart TB
  brokerin[["<b>RabbitMQ</b><br/>processor.video.uploaded"]]

  subgraph pw["processor-worker [Container]"]
    direction TB

    subgraph fwin["Frameworks & Drivers: entrada"]
      direction LR
      amqpin["Consumo AMQP<br/>prefetch 1"]
    end

    subgraph adin["Interface Adapters"]
      direction LR
      ctrl["ProcessUploadedVideo<br/><i>Controller</i>"]
    end

    subgraph app["Use Cases"]
      direction LR
      uc["ProcessUploadedVideo"]
      interfaces["<b>Interfaces</b><br/>ObjectStorage<br/>FrameExtractor<br/>ArchiveBuilder<br/>WorkDirectory<br/>EventPublisher"]
    end

    subgraph dom["Entities"]
      direction LR
      job["ProcessingJob<br/>ProcessingResult"]
      policies["Política de extração<br/>e chave do pacote"]
    end

    subgraph fwout["Frameworks & Drivers: saída"]
      direction LR
      objstore["S3ObjectStorageGateway"]
      ffmpeg["FfmpegFrameExtractorGateway"]
      zip["ZipArchiveBuilder"]
      workdir["FsWorkDirectory"]
      events["AmqpEventPublisherGateway"]
    end
  end

  storage[("<b>SeaweedFS</b>")]
  proc(["<b>ffmpeg</b><br/>processo filho"])
  disk[("<b>Disco temporário</b>")]
  brokerout[["<b>RabbitMQ</b><br/>zipframes.events"]]

  brokerin --> amqpin
  amqpin --> ctrl
  ctrl --> uc
  uc --> job
  job --- policies
  uc --> interfaces
  interfaces -. "implementadas por" .-> fwout
  objstore --> storage
  ffmpeg --> proc
  zip --> disk
  workdir --> disk
  events --> brokerout

  classDef ext fill:#8a8a8a,stroke:#5e5e5e,color:#ffffff
  classDef fwc fill:#dbe7f5,stroke:#5f86b8,color:#1b2a3a
  classDef adc fill:#cfe8dc,stroke:#4e9373,color:#15291f
  classDef appc fill:#f7e3c4,stroke:#c28a2e,color:#2e2210
  classDef domc fill:#f3d0d0,stroke:#b35c5c,color:#2e1515
  class brokerin,storage,proc,disk,brokerout ext
  class amqpin,objstore,ffmpeg,zip,workdir,events fwc
  class ctrl adc
  class uc,interfaces appc
  class job,policies domc
```

O worker não tem banco. Tudo o que ele precisa vem da mensagem (id do vídeo, dono e chave do original), do storage e de um diretório temporário criado para cada tentativa e apagado no fim, com sucesso ou não.

## Componentes

| Camada               | Componente                             | Responsabilidade                                                                                                    |
| -------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Entities             | `ProcessingJob`, `ProcessingResult`    | O trabalho recebido e o desfecho: pacote gerado ou mídia rejeitada                                                  |
| Entities             | Políticas                              | Um frame por segundo em PNG e a chave do zip, `outputs/{ownerId}/{videoId}.zip`                                     |
| Use Cases            | `ProcessUploadedVideo`                 | Publica `started`, baixa o original, extrai os frames, monta o zip, grava no storage e publica o resultado          |
| Interface Adapters   | `ProcessUploadedVideoController`       | `defineMessageHandler`: valida o envelope, chama o caso de uso e publica `video.failed` quando as tentativas acabam |
| Frameworks & Drivers | `S3ObjectStorageGateway`               | Download do original, upload do zip e remoção do original                                                           |
| Frameworks & Drivers | `FfmpegFrameExtractorGateway`          | Roda o `ffmpeg` com prazo, e o cancela se o prazo estourar                                                          |
| Frameworks & Drivers | `ZipArchiveBuilder`, `FsWorkDirectory` | Monta o zip sem recomprimir os PNGs e cuida do diretório da tentativa                                               |
| Frameworks & Drivers | `AmqpEventPublisherGateway`            | Publica `started`, `processed` e `failed` em `zipframes.events`                                                     |

O consumo usa prefetch 1: cada réplica processa um vídeo por vez, e o KEDA sobe réplicas pelo tamanho da fila.
