# Documentação do ZipFrames

**ZipFrames** é o sistema de processamento de vídeos entregue à FIAP X, desenvolvido no hackathon da POSTECH Software Architecture (Fase 5). O sistema recebe vídeos enviados por usuários autenticados, extrai um frame por segundo e entrega os frames em um arquivo zip, com processamento assíncrono, escalável e observável.

## Como ler

| Documento | Conteúdo |
|---|---|
| [Análise do projeto base](01-analise-projeto-base.md) | O que o protótipo apresentado aos investidores faz, seus problemas e o que é preservado |
| [Domínio](02-dominio.md) | Linguagem ubíqua, subdomínios, bounded contexts, agregados, regras e eventos |
| [Arquitetura](03-arquitetura.md) | Drivers, serviços, comunicação, fluxos, dados, segurança, resiliência, infraestrutura e testes |
| [C4: contexto](c4/01-contexto.md) | O sistema, seus usuários e sistemas externos |
| [C4: containers](c4/02-containers.md) | Serviços, bancos, broker e storage |
| [C4: componentes do video-service](c4/03-componentes-video-service.md) | As camadas da Clean Architecture dentro de um serviço |

## Convenções

- Os diagramas C4 seguem os níveis e a notação do [modelo C4](https://c4model.com/), desenhados como fluxogramas para manter a legibilidade.
- Os contratos de API (OpenAPI) e de eventos (AsyncAPI) ficam em `docs/openapi/` e `docs/asyncapi/` e são a fonte da verdade para payloads.

## Fluxos principais

### Cadastro e login

```mermaid
sequenceDiagram
  autonumber
  actor U as Usuário
  participant A as auth-service
  participant DB as auth-db
  participant R as RabbitMQ
  participant N as notification-service
  U->>A: POST /auth/register
  A->>DB: insere usuário e evento no outbox (mesma transação)
  A-->>U: 201 Created
  A->>R: relay publica user.registered
  R->>N: user.registered
  N->>N: grava ou atualiza o contato
  U->>A: POST /auth/login
  A->>DB: busca usuário pelo e-mail
  A->>A: compara o hash e assina o JWT (RS256)
  A-->>U: 200 com accessToken e expiresIn
```

### Envio e processamento com sucesso

```mermaid
sequenceDiagram
  autonumber
  actor U as Usuário
  participant V as video-service
  participant S as SeaweedFS
  participant DB as video-db
  participant R as RabbitMQ
  participant W as processor-worker
  U->>V: POST /videos (nome, tipo, tamanho) com JWT
  V->>DB: insere vídeo em AWAITING_UPLOAD
  V->>V: assina URL de upload (PUT)
  V-->>U: 201 com videoId, uploadUrl e expiresAt
  U->>S: PUT uploadUrl com o arquivo
  U->>V: POST /videos/{id}/confirm
  V->>S: HEAD do objeto (existe e tamanho)
  V->>DB: status QUEUED e evento no outbox (mesma transação)
  V-->>U: 202 Accepted
  V->>R: relay publica video.uploaded
  R->>W: video.uploaded
  W->>R: publica video.processing.started
  W->>S: baixa o vídeo
  W->>W: ffmpeg (fps=1) e geração do zip
  W->>S: grava outputs/{ownerId}/{videoId}.zip
  W->>R: publica video.processed
  W->>R: ack de video.uploaded
  R->>V: processing.started e processed
  V->>DB: aplica as transições e registra os eventIds
  V->>V: invalida o cache da listagem do dono
  U->>V: GET /videos/{id}/download
  V-->>U: 200 com URL de download
  U->>S: GET da URL
```

### Falha e notificação

```mermaid
sequenceDiagram
  autonumber
  participant R as RabbitMQ
  participant W as processor-worker
  participant V as video-service
  participant N as notification-service
  participant M as Servidor de e-mail
  R->>W: video.uploaded
  W->>W: o processamento falha
  alt falha transitória com tentativas restantes
    W->>R: envia para a fila de retry
    R->>W: nova entrega após o TTL
  else falha permanente ou última tentativa
    W->>R: publica video.failed
    W->>R: ack, ou envio para a DLQ na última tentativa
  end
  R->>V: video.failed
  V->>V: status FAILED com o motivo
  R->>N: video.failed
  N->>N: registra a notificação (única por vídeo)
  N->>M: envia o e-mail
```
## Clean Architecture nos serviços

Todos os serviços seguem a mesma organização:

```
src/
├── domain/        # Entities: entidades, value objects, eventos de domínio
├── application/   # Use Cases
│   ├── use-cases/
│   └── ports/     # interfaces de que os use cases precisam
├── adapters/      # Interface Adapters
│   ├── http/          # controllers, DTOs, schemas
│   ├── messaging/     # consumers, publishers, outbox relay
│   ├── persistence/   # repositórios e mappers
│   └── storage/       # acesso ao object storage
├── frameworks/    # Frameworks & Drivers: servidor, clientes e conexões
└── main/          # composition root: configuração e injeção de dependências
```

```mermaid
flowchart LR
  MAIN["main<br/>composition root"]
  FW["frameworks<br/>Frameworks & Drivers"]
  AD["adapters<br/>Interface Adapters"]
  APP["application<br/>Use Cases"]
  DOM["domain<br/>Entities"]
  MAIN --> FW
  MAIN --> AD
  MAIN --> APP
  FW --> AD
  AD --> APP
  AD --> DOM
  APP --> DOM
```

As setas indicam quem pode importar quem. As dependências sempre apontam para o centro:

| Camada | Pode importar | Não pode importar |
|---|---|---|
| `domain` | Nada além da biblioteca padrão | Qualquer outra camada ou biblioteca de infraestrutura |
| `application` | `domain` | `adapters`, `frameworks`, `main`, Prisma, Fastify, amqplib, SDK S3 |
| `adapters` | `application`, `domain` e bibliotecas de integração | `frameworks`, `main` (recebem clientes por construtor) |
| `frameworks` | `adapters` e bibliotecas | `main` |
| `main` | Todas | — |

Os use cases dependem apenas de interfaces (ports). O `main` cria as implementações concretas e as injeta. Isso permite testar cada use case com implementações em memória, sem banco, broker ou rede.

As regras da tabela são verificadas no CI com o dependency-cruiser. Um import que viole a direção faz o pipeline falhar.

O `processor-worker` segue a mesma estrutura. O `ffmpeg` é um detalhe de infraestrutura atrás do port `FrameExtractor`, e o zip fica atrás do port `FramesPackager`.
