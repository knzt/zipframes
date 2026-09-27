# Regras de camadas

Este documento descreve as regras de dependência entre camadas, verificadas automaticamente pelo [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) no CI e no script `pnpm check:layers`.

A Clean Architecture de Robert C. Martin é a base. A regra que fica do livro é a direção da dependência: uma regra de negócio não importa um detalhe de entrega ou de persistência, e uma pasta mais interna não importa uma mais externa. O desenho do livro são quatro anéis — entidades, casos de uso, interface adapters, frameworks e drivers. Este repositório desenha esses quatro anéis em quatro pastas em `src/`:

- `domain/` — entidades, value objects, eventos, erros e policies. Sem injeção. Sem `new` de infra.
- `application/` — casos de uso e as interfaces (ports) que eles declaram. Só `import type` dos ports.
- `interface-adapters/` — classes controller. Recebem o caso de uso. Não importam Prisma, S3, Fastify nem `main/`.
- `infrastructure/` — classes dos drivers (Prisma, amqplib, Fastify, S3, ffmpeg). Recebem cada dependência como parâmetro explícito no construtor. Não importam factories nem `main/`.

`main/` é o composition root. É o único código que conhece port e concreto, e só na inicialização. O `new` das classes de `interface-adapters/` e `infrastructure/` acontece só nas factories em `main/factories/`. Nenhum arquivo se chama `compose.ts`: o processo sobe em `start.ts`.

Depois da inicialização, um pedido não procura a infraestrutura: ela já foi injetada. Nenhum use case, controller, gateway ou repositório importa `main/`. A seta fica para dentro:

```
main  →  interface-adapters / infrastructure  →  application  →  domain
```

No `auth-service`, `index.ts` trata sinal e chama `startAuthService()`. `start.ts` abre Prisma e AMQP, deriva o `tokenIssuer` (também o JWKS), chama as factories de controller e dá `listen`. Não monta o grafo: a factory do controller chama a factory do caso de uso, que chama repositório, hasher e publisher. O controller em `interface-adapters/` é a borda HTTP: usa `defineHandler` de `@zipframes/http` (sem Fastify) para validar o pedido, chamar `RegisterUserUseCase` ou `LoginUseCase` e traduzir o `Result` em `HttpReply` (status, problem+json). As rotas em `infrastructure/http/routes/` são só catálogo: `method`/`path`/`openApi` e `handle` delegando ao controller; `identityRoutes.ts` junta as três. O JWKS não tem caso de uso nem controller e responde direto da rota. `bindHttpRoutes` em `infrastructure/http/fastify` é o único `app.route`. Fastify fica em `infrastructure/http/fastify/` — não há `src/app.ts` nem `src/server.ts`. `HttpRouteDefinition`, `jsonSchemaOf` e o schema de problem+json ficam em `infrastructure/http/`, ao lado da pasta do driver. O caso de uso chama `UserRepository`, `EventPublisher`, `PasswordHasher` e `TokenIssuer`. Essas chamadas caem nos objetos injetados — `PrismaUserRepository`, `AmqpEventPublisherGateway`, `BcryptPasswordHasher`, `Rs256TokenIssuer`. O `User` gera o próprio id (`randomUUID`). `new Date()` entra no cadastro; o gateway de evento gera `eventId`. Não há ports `Clock` / `IdGenerator`.

No `processor-worker` não há HTTP. O controller em `interface-adapters/` é a borda da mensagem, como no auth é a borda HTTP: decodifica `video.uploaded` (`parseSchema`), chama o caso de uso e devolve uma decisão sem AMQP (`ack`, `retry` ou `dead_letter`); quando as tentativas acabam, publica `video.failed` antes de pedir a dead-letter. O consumer em `infrastructure/messaging/amqplib` passa o envelope cru ao controller sob o correlation id, registra log e métricas e executa a decisão (`ack`/`retry`/`deadLetter`). `start.ts` abre AMQP e S3, chama `createEventPublisherGateway(amqp)` uma vez, passa esse gateway a `createProcessUploadedVideoController({ s3, eventPublisher, bucket, workDir, processingTimeoutMs, retry, onDiscardOriginalFailed })`, entrega o controller ao consumer e dá `consume`. A factory do controller chama a do caso de uso, que instancia storage, ffmpeg, zip e diretório de trabalho — o publisher já veio montado. O caso de uso chama `ObjectStorage`, `FrameExtractor`, `EventPublisher`, `ArchiveBuilder` e `WorkDirectory`. O cliente S3 nasce em `main/factories/externals/s3.ts` (`new S3Client`, `export type S3 = ReturnType<typeof createS3>`); o port é `new S3ObjectStorageGateway(s3, bucket)` em `gateways/objectStorageGateway.ts`, tipado com `S3`, não com `S3Client`. Probes de Compose e Kubernetes são exec (`kill -0 1`), não HTTP na 8081.

O `index.ts` dos dois serviços trata sinal com um guard `stopping` para o shutdown não fechar o canal duas vezes. `runService()` em `@zipframes/core` é candidato a extrair esse laço quando aparecer o terceiro serviço.

Injeção é pura: cada factory exporta uma função que faz `new` e devolve o objeto. Sem `let` no módulo. `start.ts` abre as conexões uma vez e passa esses clientes às factories de controller, para não abrir Prisma/AMQP/S3 duas vezes. A factory do controller chama a factory do caso de uso; essa chama as factories de repositório, gateway e serviço. Teste chama de novo com fakes.

A interface fica ao lado do caso de uso, e não ao lado da classe do Prisma, para o caso de uso não precisar importar `infrastructure` só para enxergar o tipo. A regra da aplicação permanece estável quando o driver muda. Um teste do caso de uso entrega um fake. Um driver novo é uma classe nova em `infrastructure/` e a factory em `main/` que a instancia.

`domain/` fica no centro: entidades, value objects, eventos de domínio, erros e policies. Não conhece HTTP, banco, fila nem ffmpeg.

A arquitetura interna de cada microsserviço vive em [services/](./services/). O contrato HTTP (saúde e OpenAPI) está em [http.md](./http.md).

## A regra de dependência

As dependências de código apontam **sempre para dentro**. Uma pasta mais interna nunca importa uma mais externa.

```
infrastructure / interface-adapters  →  application  →  domain
(mais externo)                                          (mais interno)
```

`main/` é o composition root. Ele conhece as outras pastas só para montar o grafo na inicialização. Nada em `src/` fora de `main/` importa `main/` (as factories em `main/` montam o grafo; `start.ts` só abre conexões e chama as factories de controller; testes unitários passam fakes).

### Layout

| Pasta                     | Neste projeto        | Conteúdo                                                                                                         |
| ------------------------- | -------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `src/domain/`             | Entidades            | Entidades, value objects, eventos de domínio, erros e policies                                                   |
| `src/application/`        | Casos de uso e ports | Casos de uso, tipos e as interfaces que os casos de uso declaram (`interfaces/{repositories,gateways,services}`) |
| `src/interface-adapters/` | Interface adapters   | Classes controller da borda (HTTP ou mensagem)                                                                   |
| `src/infrastructure/`     | Frameworks e drivers | Classes que implementam as interfaces, HTTP (auth), messaging, config, observability                             |
| `src/main/`               | Composition root     | `index.ts` (sinais), `start.ts` (sobe e para o processo), `factories/` por responsabilidade                      |

O caso de uso fica em `application/useCases/`. O controller da borda fica em `interface-adapters/`. A interface que o caso de uso declara fica em `application/interfaces/`. A classe que implementa essa interface fica em `infrastructure/`, com o framework. O caso de uso não importa a implementação. A implementação importa a interface.

A pasta não se chama `ports/`. O nome daqui é `interfaces/`.

Factories em `main/factories/` agrupam por responsabilidade. O arquivo e a função incluem o papel: `use-cases/loginUseCase.ts` → `createLoginUseCase`; `gateways/objectStorageGateway.ts` → `new S3ObjectStorageGateway(s3, bucket)`. Endpoint novo: um arquivo em `use-cases/`, `controllers/` e (no auth) `infrastructure/http/routes/`. Construtores recebem cada dependência como parâmetro explícito (`constructor(private readonly prisma: PrismaClient)`), não um saco `*Deps` que força `this.deps.prisma`. Na borda da factory, o saco de clientes já abertos continua `externalDeps` (`createLoginUseCase({ prisma, tokenIssuer })`); a factory desembrulha e passa cada um ao construtor.

#### Interfaces em `application/interfaces/`

Três categorias em `application/interfaces/`, espelhadas em `infrastructure/` e nas factories de `main/`:

| Categoria       | Critério                                                          | Exemplos                                                           |
| --------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------ |
| `repositories/` | Devolve e recebe **objetos de domínio**                           | `UserRepository`                                                   |
| `gateways/`     | Cruza a fronteira do processo sem falar em termos de domínio      | `ObjectStorage`, `EventPublisher`, `FrameExtractor`                |
| `services/`     | Capacidade técnica **local** (mesmo processo; sem estado externo) | `PasswordHasher`, `TokenIssuer`, `ArchiveBuilder`, `WorkDirectory` |

`gateway`, neste mapa, é a interface que o caso de uso declara quando o trabalho sai do processo: object storage, publicação de evento, extração de frames por um programa que não é o processo Node. A interface fica em `application/interfaces/gateways/`. A classe que a implementa fica em `infrastructure/gateways/` e é ela que segura o SDK. O `processor-worker` e o `auth-service` usam essa pasta. No `auth-service`, a persistência continua repository (`UserRepository`); a publicação de `user.registered` é `EventPublisher`, como no worker. `infrastructure/messaging/amqplib` só segura a conexão e a topologia. O envelope (`eventId`, `version`, `occurredAt`) é montado no gateway AMQP.

#### Nomenclatura

Pastas em **camelCase**. Arquivos de classe e de interface usam o nome do tipo. A pasta já diz o papel (`repositories/`, `gateways/`, `services/`). Funções factory e classes concretas incluem o papel no nome (`createLoginUseCase`, `AmqpEventPublisherGateway`, `PrismaUserRepository`). Entrada e saída de caso de uso que são DTOs ficam em `*.dto.ts`. Alias que só reexportam um tipo de domínio ficam no próprio módulo do caso de uso.

| Tipo        | Exemplo                                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Caso de uso | `application/useCases/registerUser/RegisterUserUseCase.ts`                                                                          |
| DTO         | `registerUser.dto.ts` (ao lado do caso de uso): `RegisterUserUseCaseInput`, `RegisterUserUseCaseOutput`, `RegisterUserUseCaseError` |
| Factory     | `main/factories/use-cases/registerUserUseCase.ts` → `createRegisterUserUseCase`                                                     |
| Controller  | `interface-adapters/RegisterUserController.ts` (no auth: valida, chama o caso de uso e devolve `HttpReply`)                         |
| HTTP        | Catálogo em `infrastructure/http/routes/`; Fastify em `infrastructure/http/fastify/`; `bindHttpRoutes` encaminha `HttpReply`        |
| Repository  | `application/interfaces/repositories/UserRepository.ts`                                                                             |
| Gateway     | `application/interfaces/gateways/ObjectStorage.ts`; concreto `S3ObjectStorageGateway`                                               |
| Service     | `application/interfaces/services/PasswordHasher.ts`                                                                                 |
| Processo    | `main/start.ts` (não `compose.ts`)                                                                                                  |

Cada subpasta pública de `domain/` e `application/` expõe um `index.ts` (barrel).

### Dependência externa

O código que importa um SDK mora em `src/infrastructure/`. A interface que esse código implementa mora em `application/interfaces/`. `main/factories/` instancia o SDK (`externals/`) e entrega a implementação ao caso de uso.

Tudo o que pertence a um ORM fica na pasta desse repository. Para o Prisma, schema, migrations e o repositório concreto ficam juntos em `src/infrastructure/repositories/prisma/`. O `new PrismaClient` é a factory `main/factories/externals/prisma.ts` (`export type Prisma = ReturnType<typeof createPrisma>`). O ping de readiness fica ao lado dessa factory, não num `client.ts`.

Tudo o que pertence ao amqplib fica em `src/infrastructure/messaging/amqplib/` (`connection.ts`, `amqpTopology.ts`; no worker também o consumer e o settle). `amqpTopology.ts` declara exchanges, filas e bindings que o processo afirma no broker ao subir — não é uma camada. A factory `main/factories/externals/amqplib.ts` abre a conexão uma vez em `start.ts` (`export type Amqplib = Awaited<ReturnType<typeof createAmqplib>>`).

Tudo o que pertence ao Fastify fica em `src/infrastructure/http/fastify/` (`server.ts`, `bindHttpRoutes`, adapter, health, plugins). O catálogo de rotas (`HttpRouteDefinition`) e as schemas de OpenAPI/problem ficam em `infrastructure/http/`, ao lado da pasta do driver, porque não importam Fastify.

### Falhas: `Result` vs `throw`

- **auth-service** usa `Result<T, E>` (`@zipframes/core`) nas interfaces e nos casos de uso; o controller lê `error.statusCode` para problem+json (400, 409, 401). Login com body inválido continua 401 sem `detail`, mesmo quando o parse seria `ValidationError` 400. Falha inesperada que escapa vira `InternalServerError` → 500 sem `detail`. `User.create` devolve `Result<User, ValidationError>`; o construtor fica privado ao módulo.
- **processor-worker** lança erros do `@zipframes/core` com `retryable` (`UnavailableError`, `TimeoutError`, `InternalServerError`, …). No controller, um único critério para classificar a falha: `isRetryableError`; `decideRetry` escolhe entre nova tentativa e dead-letter.

Conflito de e-mail no cadastro: `findByEmail` + `ConflictError` no caso de uso; o repositório só insere (`create`) e relança erros do Prisma — corrida ou unique inesperado vira 500, não `ConflictError` na infra. Health/readiness e métricas do auth não expõem `error.message` — log interno e `reason` estável na resposta HTTP.

Não misturar os dois estilos dentro do mesmo caso de uso.

### Health e readiness

O contrato HTTP de saúde vale para processos que escutam HTTP. Hoje isso é o `auth-service`. Rotas, corpo da resposta, probes e a documentação gerada estão em [http.md](./http.md).

O `processor-worker` não escuta HTTP. Liveness e readiness no Compose e no Kubernetes são probes exec.

Checagens do auth usam `Pingable` + `createReadinessCheck` de `@zipframes/core` (ISP: `ping` não entra nas interfaces de negócio).

## O que cada pasta pode importar

| Pasta                     | Pode importar                                                                                                | Nunca pode importar                                                                      |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `src/domain/`             | Biblioteca padrão, `@types/*`, `@zipframes/core`, `@zipframes/value-objects`                                 | `application/`, `interface-adapters/`, `infrastructure/`, `main/`, libs de infra         |
| `src/application/`        | `domain/`, pacotes `@zipframes/*` de contrato                                                                | `interface-adapters/`, `infrastructure/`, `main/`, Prisma, amqplib, `@aws-sdk`, Fastify… |
| `src/interface-adapters/` | `application/`, `domain/`, pacotes `@zipframes/*` de contrato                                                | `infrastructure/`, `main/`, Prisma, S3, Fastify, amqplib                                 |
| `src/infrastructure/`     | `application/`, `domain/`, `interface-adapters/` (tipo do controller no consumer), bibliotecas de integração | `main/`                                                                                  |
| `src/main/`               | Todas as camadas                                                                                             | —                                                                                        |

O `main/` é a única exceção que conhece todas as camadas para montar o grafo.

## Regras de microsserviços

- **Serviços não importam outros serviços.** Código compartilhado vem dos pacotes npm `@zipframes/*`, por versão.
- **Política fica no serviço.** O pacote valida forma (ex.: e-mail); o serviço decide política de negócio.

## Como verificar localmente

```bash
pnpm check:layers
```

No Windows, se `sh` não estiver disponível:

```bash
pnpm exec depcruise --config .dependency-cruiser.mjs services/processor-worker/src
pnpm exec depcruise --config .dependency-cruiser.mjs services/auth-service/src
```

## O que fazer quando uma violação é encontrada

1. Leia o nome da regra na saída.
2. Opções comuns:
   - Mover o código para a camada correta.
   - Extrair a interface em `application/interfaces/` e injetar a implementação pelo `main/`.
   - Publicar código técnico universal em um pacote `@zipframes/*`.
3. Nunca suprima a regra sem comentário explicando o porquê.

## Configuração do dependency-cruiser

Arquivo: [`.dependency-cruiser.mjs`](../../.dependency-cruiser.mjs). Regras `forbidden` cobrem `domain/`, `application/`, `interface-adapters/`, `infrastructure/` e `main/`. Nada em `src/` fora de `main/` importa `main/`.
