# Regras de camadas

Este documento descreve as regras de dependência entre camadas, verificadas automaticamente pelo [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) no CI e no script `pnpm check:layers`.

A Clean Architecture de Robert C. Martin é a base: as dependências de código apontam para dentro. Não é uma cópia das quatro camadas do livro. A pasta `application/` junta o que o livro separa: casos de uso e interface adapters. A arquitetura interna de cada microsserviço vive em [services/](./services/). O contrato HTTP (saúde e OpenAPI) está em [http.md](./http.md).

## A regra de dependência

As dependências de código apontam **sempre para dentro**. Uma pasta mais interna nunca importa uma mais externa.

```
infrastructure  →  application  →  domain
(mais externo)                    (mais interno)
```

`main/` é o composition root. Ele conhece as outras pastas só para montar o grafo na inicialização.

### Layout

A regra é a direção da dependência, não o desenho das quatro camadas do livro.

| Pasta                 | Neste projeto                     | Conteúdo                                                                                             |
| --------------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `src/domain/`         | Entidades                         | Entidades, value objects, eventos de domínio, erros e policies                                       |
| `src/application/`    | Casos de uso e interface adapters | Casos de uso, DTOs e as interfaces que eles declaram (`interfaces/{repositories,gateways,services}`) |
| `src/infrastructure/` | Implementação e frameworks        | Classes que implementam essas interfaces, HTTP, messaging, config, observability                     |
| `src/main/`           | Composition root                  | Wiring na inicialização                                                                              |

O caso de uso fica em `application/useCases/`. O interface adapter é a interface em `application/interfaces/` que o caso de uso declara. A classe que implementa essa interface fica em `infrastructure/`, com o framework. O caso de uso não importa a implementação. A implementação importa a interface.

A pasta não se chama `ports/`. O nome daqui é `interfaces/`.

#### Interfaces em `application/interfaces/`

Três categorias em `application/interfaces/`, espelhadas em `infrastructure/`:

| Categoria       | Critério                                                          | Exemplos                                                                  |
| --------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `repositories/` | Devolve e recebe **objetos de domínio**                           | `UserRepository`                                                          |
| `gateways/`     | Cruza a fronteira do processo sem falar em termos de domínio      | `ObjectStorage`, `EventPublisher`, `FrameExtractor`                       |
| `services/`     | Capacidade técnica **local** (mesmo processo; sem estado externo) | `PasswordHasher`, `TokenIssuer`, `Clock`, `IdGenerator`, `ArchiveBuilder` |

Pastas vazias não são criadas: a ausência de `interfaces/repositories/` no processor-worker comunica que o contexto é stateless.

`gateway`, neste mapa, é o nome da **interface** que o caso de uso declara para atravessar a fronteira do processo. A classe em `infrastructure/gateways/` implementa essa interface. O tipo `PublishPort` de `@zipframes/communication` é contrato daquele pacote, não uma interface de `application/`.

#### Nomenclatura

Pastas e arquivos em **camelCase**, com marcador de tipo no arquivo quando o tipo não é óbvio só pela pasta:

| Tipo        | Exemplo                                                     |
| ----------- | ----------------------------------------------------------- |
| Caso de uso | `application/useCases/registerUser/registerUser.useCase.ts` |
| DTO         | `registerUser.dto.ts` (ao lado do caso de uso)              |
| Repository  | `user.repository.ts`                                        |
| Gateway     | `objectStorage.gateway.ts`                                  |
| Service     | `passwordHasher.service.ts`                                 |

Cada subpasta pública de `domain/` e `application/` expõe um `index.ts` (barrel).

### Dependência externa

O código que importa um SDK mora em `src/infrastructure/`. A interface que esse código implementa mora em `application/interfaces/`. `main/` instancia o SDK e entrega a implementação ao caso de uso.

Tudo o que pertence a um ORM fica na pasta desse repository. Para o Prisma, schema, migrations, client e o repositório concreto ficam juntos em `src/infrastructure/repositories/prisma/`.

### Falhas: `Result` vs `throw`

- **auth-service** usa `Result<T, E>` (`@zipframes/core`) nas interfaces e nos casos de uso.
- **processor-worker** lança erros com `retryable: boolean` (mesmo vocabulário de `InfrastructureError` em `@zipframes/core`), adequado a um pipeline com I/O externo.

Não misturar os dois estilos dentro do mesmo caso de uso.

### Health e readiness

O contrato HTTP é um só e o servidor é Fastify, inclusive no worker. Rotas, corpo da resposta, probes e a documentação gerada estão em [http.md](./http.md).

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
- **A interface fica para dentro e a implementação para fora.** O caso de uso não importa SDK. A classe que fala com o SDK implementa a interface declarada em `application/interfaces/` e mora em `infrastructure/`.

## Regras adicionais

- **Sem dependências cíclicas** em nenhuma camada.
- **Vitest só em arquivos de teste** (`*.test.ts` e `*.spec.ts`).

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
