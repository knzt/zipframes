# Regras de camadas

Este documento descreve as regras de dependência entre camadas, verificadas automaticamente pelo [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) no CI e no script `pnpm check:layers`.

A Clean Architecture de Robert C. Martin é a base. A regra que fica do livro é a direção da dependência: uma regra de negócio não importa um detalhe de entrega ou de persistência, e uma pasta mais interna não importa uma mais externa. O desenho do livro são quatro anéis — entidades, casos de uso, interface adapters, frameworks e drivers. Este repositório não desenha esses quatro anéis em quatro pastas.

A pasta `application/` junta o que o livro separa: casos de uso e interface adapters. Os dois ficam juntos porque a interface só existe para o caso de uso chamar alguma coisa fora dele sem nomear a tecnologia. O caso de uso mora em `application/useCases/`. Ele recebe um comando e conduz a regra da aplicação: cadastrar um usuário, autenticar, processar um vídeo que chegou. Quando precisa de persistência, de um programa externo ou de um relógio, chama uma interface que ele mesmo declara em `application/interfaces/`.

O controller em `application/controllers/` é o interface adapter da borda. Ele recebe o pedido já traduzido, chama o caso de uso e devolve status e corpo. Não importa Fastify, Prisma nem AMQP. A rota HTTP e o consumer AMQP só ligam o framework a esse resultado. As interfaces em `application/interfaces/` continuam sendo o que o caso de uso declara: guardar um `User`, extrair frames, publicar um evento, calcular um hash. A classe que implementa essa interface fica em `infrastructure/`, ao lado do framework que ela usa. O caso de uso não importa essa classe. A classe importa a interface. A seta fica para dentro: `infrastructure` depende de `application`, e `application` depende de `domain`.

A interface fica ao lado do caso de uso, e não ao lado da classe do Prisma, para o caso de uso não precisar importar `infrastructure` só para enxergar o tipo. A regra da aplicação permanece estável quando o driver muda. Um teste do caso de uso entrega um fake. Um driver novo é uma classe nova em `infrastructure/` e a linha em `main/` que a instancia.

`main/` é o composition root. É o único código que conhece todas as pastas, e só na inicialização. Ele constrói os objetos de infraestrutura e entrega essas implementações ao caso de uso. Depois disso, um pedido não procura a infraestrutura: ela já foi injetada.

No `auth-service`, o Fastify recebe o HTTP em `infrastructure/http`. A rota lê o corpo e o correlation id e chama o controller em `application/controllers/`. O controller valida o pedido, chama `RegisterUserUseCase` ou `LoginUseCase` e devolve status e corpo. O caso de uso chama `UserRepository`, `EventPublisher`, `PasswordHasher`, `TokenIssuer` e as outras interfaces que declarou. Essas chamadas caem nos objetos injetados — `PrismaUserRepository`, o gateway AMQP, `BcryptPasswordHasher`, `Rs256TokenIssuer` — e são eles que falam com o Postgres, o RabbitMQ, o bcrypt e a chave RS256. A rota só escreve a resposta que o controller devolveu. O controller e o caso de uso não importam Fastify nem Prisma.

No `processor-worker`, o consumer AMQP em `infrastructure/messaging` decodifica `video.uploaded` e chama o controller. O controller entrega o envelope já decodificado a `ProcessUploadedVideoUseCase`. O caso de uso chama `ObjectStorage`, `FrameExtractor`, `EventPublisher`, `ArchiveBuilder` e `WorkDirectory`. As implementações — storage S3, ffmpeg, o publisher AMQP, o zip e o diretório temporário — foram criadas em `main/` e ficam em `infrastructure/gateways/` e `infrastructure/services/`. O consumer confirma, tenta de novo ou envia à dead-letter a partir do desfecho. O controller e o caso de uso não importam o SDK da AWS nem o cliente AMQP.

`domain/` fica no centro: entidades, value objects, eventos de domínio, erros e policies. Não conhece HTTP, banco, fila nem ffmpeg.

A arquitetura interna de cada microsserviço vive em [services/](./services/). O contrato HTTP (saúde e OpenAPI) está em [http.md](./http.md).

## A regra de dependência

As dependências de código apontam **sempre para dentro**. Uma pasta mais interna nunca importa uma mais externa.

```
infrastructure  →  application  →  domain
(mais externo)                    (mais interno)
```

`main/` é o composition root. Ele conhece as outras pastas só para montar o grafo na inicialização.

### Layout

| Pasta                 | Neste projeto                     | Conteúdo                                                                                                                               |
| --------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `src/domain/`         | Entidades                         | Entidades, value objects, eventos de domínio, erros e policies                                                                         |
| `src/application/`    | Casos de uso e interface adapters | Casos de uso, controllers da borda, tipos e as interfaces que os casos de uso declaram (`interfaces/{repositories,gateways,services}`) |
| `src/infrastructure/` | Implementação e frameworks        | Classes que implementam essas interfaces, HTTP, messaging, config, observability                                                       |
| `src/main/`           | Composition root                  | Wiring na inicialização                                                                                                                |

O caso de uso fica em `application/useCases/`. O controller da borda fica em `application/controllers/`. A interface que o caso de uso declara fica em `application/interfaces/`. A classe que implementa essa interface fica em `infrastructure/`, com o framework. O caso de uso não importa a implementação. A implementação importa a interface.

A pasta não se chama `ports/`. O nome daqui é `interfaces/`.

#### Interfaces em `application/interfaces/`

Três categorias em `application/interfaces/`, espelhadas em `infrastructure/`:

| Categoria       | Critério                                                          | Exemplos                                                                  |
| --------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `repositories/` | Devolve e recebe **objetos de domínio**                           | `UserRepository`                                                          |
| `gateways/`     | Cruza a fronteira do processo sem falar em termos de domínio      | `ObjectStorage`, `EventPublisher`, `FrameExtractor`                       |
| `services/`     | Capacidade técnica **local** (mesmo processo; sem estado externo) | `PasswordHasher`, `TokenIssuer`, `Clock`, `IdGenerator`, `ArchiveBuilder` |

`gateway`, neste mapa, é a interface que o caso de uso declara quando o trabalho sai do processo: object storage, publicação de evento, extração de frames por um programa que não é o processo Node. A interface fica em `application/interfaces/gateways/`. A classe que a implementa fica em `infrastructure/gateways/` e é ela que segura o SDK. O `processor-worker` e o `auth-service` usam essa pasta. No `auth-service`, a persistência continua repository (`UserRepository`); a publicação de `user.registered` é `EventPublisher`, como no worker. `infrastructure/messaging` só segura a conexão e o `PublishPort`. O envelope (`eventId`, `version`, `occurredAt`) é montado no gateway AMQP.

#### Nomenclatura

Pastas em **camelCase**. Arquivos de classe e de interface usam o nome do tipo. A pasta já diz o papel (`repositories/`, `gateways/`, `services/`). Tipos que não são uma classe ficam em `*.types.ts`.

| Tipo        | Exemplo                                                                                                                               |
| ----------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Caso de uso | `application/useCases/registerUser/RegisterUserUseCase.ts`                                                                            |
| Tipos       | `registerUser.types.ts` (ao lado do caso de uso): `RegisterUserUseCaseInput`, `RegisterUserUseCaseOutput`, `RegisterUserUseCaseError` |
| Controller  | `application/controllers/RegisterUserController.ts` (declara `RegisterUserControllerRequest` e `RegisterUserControllerResponse`)      |
| HTTP        | `infrastructure/http/httpReply.ts` (formato que a rota Fastify envia)                                                                 |
| Repository  | `application/interfaces/repositories/UserRepository.ts`                                                                               |
| Gateway     | `application/interfaces/gateways/ObjectStorage.ts`                                                                                    |
| Service     | `application/interfaces/services/PasswordHasher.ts`                                                                                   |

Cada subpasta pública de `domain/` e `application/` expõe um `index.ts` (barrel).

### Dependência externa

O código que importa um SDK mora em `src/infrastructure/`. A interface que esse código implementa mora em `application/interfaces/`. `main/` instancia o SDK e entrega a implementação ao caso de uso.

Tudo o que pertence a um ORM fica na pasta desse repository. Para o Prisma, schema, migrations, client e o repositório concreto ficam juntos em `src/infrastructure/repositories/prisma/`.

### Falhas: `Result` vs `throw`

- **auth-service** usa `Result<T, E>` (`@zipframes/core`) nas interfaces e nos casos de uso; o controller lê `error.statusCode` para problem+json (400, 409, 401). Login com body inválido continua 401 sem `detail`, mesmo quando o parse seria `ValidationError` 400. Falha inesperada que escapa vira `InternalServerError` → 500 sem `detail`.
- **processor-worker** lança erros do `@zipframes/core` com `retryable` (`UnavailableError`, `TimeoutError`, `InternalServerError`, …). Na borda do consumer, um único critério: `isRetryableError`.

Conflito de e-mail no cadastro: `findByEmail` + `ConflictError` no caso de uso; o repositório só insere (`create`) e relança erros do Prisma — corrida ou unique inesperado vira 500, não `ConflictError` na infra. Health/readiness e métricas do worker não expõem `error.message` — log interno e `reason` estável na resposta HTTP.

Não misturar os dois estilos dentro do mesmo caso de uso.

### Health e readiness

O contrato HTTP é um só e o servidor é Fastify. Rotas, corpo da resposta, probes e a documentação gerada estão em [http.md](./http.md).

Checagens usam `Pingable` + `createReadinessCheck` de `@zipframes/core` (ISP: `ping` não entra nas interfaces de negócio).

## O que cada pasta pode importar

| Pasta                 | Pode importar                                                                | Nunca pode importar                                               |
| --------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `src/domain/`         | Biblioteca padrão, `@types/*`, `@zipframes/core`, `@zipframes/value-objects` | `application/`, `infrastructure/`, `main/`, libs de infra         |
| `src/application/`    | `domain/`, pacotes `@zipframes/*` de contrato                                | `infrastructure/`, `main/`, Prisma, amqplib, `@aws-sdk`, Fastify… |
| `src/infrastructure/` | `application/`, `domain/`, bibliotecas de integração                         | `main/`                                                           |
| `src/main/`           | Todas as camadas                                                             | —                                                                 |

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

Arquivo: [`.dependency-cruiser.mjs`](../../.dependency-cruiser.mjs). Regras `forbidden` cobrem `domain/`, `application/`, `infrastructure/` e `main/`.
