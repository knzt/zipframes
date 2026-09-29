# C4 nível 3: componentes do notifier-service

O notifier-service por dentro: duas filas, uma para manter a cópia local dos contatos e outra para enviar os e-mails de resultado. Os nomes nas caixas são os nomes das classes no código. As decisões por trás deste desenho estão em [notifier-service.md](../services/notifier-service.md).

```mermaid
flowchart TB
  qcontacts[["<b>RabbitMQ</b><br/>notifier.contacts"]]
  qemails[["<b>RabbitMQ</b><br/>notifier.emails"]]

  subgraph ns["notifier-service [Container]"]
    direction TB

    subgraph fwin["Frameworks & Drivers: entrada"]
      direction LR
      ccons["ContactEventsConsumer"]
      econs["EmailEventsConsumer"]
    end

    subgraph adin["Interface Adapters"]
      direction LR
      cctrl["UserRegistered, UserUpdated,<br/>UserDeleted<br/><i>Controllers</i>"]
      ectrl["VideoProcessed, VideoFailed<br/><i>Controllers</i>"]
    end

    subgraph app["Use Cases"]
      direction LR
      uc["UpsertContact<br/>DeleteContact<br/>NotifyVideoProcessed<br/>NotifyVideoFailed<br/>SendNotificationEmail"]
      interfaces["<b>Interfaces</b><br/>ContactRepository<br/>NotificationRepository<br/>MailGateway<br/>ObjectStorage"]
    end

    subgraph dom["Entities"]
      direction LR
      entities["Contact<br/>Notification<br/>NotificationAttempt"]
      policy["Conteúdo dos e-mails"]
    end

    subgraph fwout["Frameworks & Drivers: saída"]
      direction LR
      crepo["PrismaContactRepository"]
      nrepo["PrismaNotificationRepository"]
      mail["NodemailerMailGateway"]
      signer["S3ObjectStorageGateway<br/>(só assina a URL)"]
    end
  end

  db[("<b>notification-db</b>")]
  smtp["<b>Servidor de e-mail</b><br/>(Mailpit no ambiente local)"]

  qcontacts --> ccons
  qemails --> econs
  ccons --> cctrl
  econs --> ectrl
  cctrl --> uc
  ectrl --> uc
  uc --> entities
  entities --- policy
  uc --> interfaces
  interfaces -. "implementadas por" .-> fwout
  crepo --> db
  nrepo --> db
  mail --> smtp

  classDef ext fill:#8a8a8a,stroke:#5e5e5e,color:#ffffff
  classDef fwc fill:#dbe7f5,stroke:#5f86b8,color:#1b2a3a
  classDef adc fill:#cfe8dc,stroke:#4e9373,color:#15291f
  classDef appc fill:#f7e3c4,stroke:#c28a2e,color:#2e2210
  classDef domc fill:#f3d0d0,stroke:#b35c5c,color:#2e1515
  class qcontacts,qemails,db,smtp ext
  class ccons,econs,crepo,nrepo,mail,signer fwc
  class cctrl,ectrl adc
  class uc,interfaces appc
  class entities,policy domc
```

Cada consumer lê o `eventType` da mensagem e entrega ao controller daquele evento, que valida o envelope com o schema certo. Um evento que a fila não espera vai para a DLQ.

O `S3ObjectStorageGateway` não fala com o storage: ele assina a URL de download do zip com o endpoint público, um cálculo local. Quem baixa o arquivo é o usuário, pelo link do e-mail.

## Componentes

| Camada               | Componente                                                | Responsabilidade                                                                                          |
| -------------------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Entities             | `Contact`                                                 | Nome e e-mail do usuário, copiados dos eventos de identidade                                              |
| Entities             | `Notification`, `NotificationAttempt`                     | Um e-mail por vídeo e por tipo, com o status (`PENDING`, `SENT`, `FAILED`) e cada tentativa de envio SMTP |
| Use Cases            | `UpsertContact`, `DeleteContact`                          | Mantêm a cópia do contato; ao gravar um contato, enviam os e-mails que esperavam por ele                  |
| Use Cases            | `NotifyVideoProcessed`, `NotifyVideoFailed`               | Criam a notificação do vídeo (uma por tipo) e pedem o envio                                               |
| Use Cases            | `SendNotificationEmail`                                   | Envia pelo SMTP com até 3 tentativas; sem contato, deixa a notificação `PENDING`                          |
| Interface Adapters   | Controllers                                               | `defineMessageHandler`: um por evento, validam o envelope e chamam o caso de uso                          |
| Frameworks & Drivers | `PrismaContactRepository`, `PrismaNotificationRepository` | Tabelas `contacts`, `notifications` e `notification_attempts`                                             |
| Frameworks & Drivers | `NodemailerMailGateway`                                   | Envio SMTP                                                                                                |
| Frameworks & Drivers | `S3ObjectStorageGateway`                                  | Assina a URL GET do zip, válida por 24 horas                                                              |
