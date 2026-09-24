# Regras de camadas (Clean Architecture)

Este documento descreve as regras de dependência entre camadas, verificadas automaticamente pelo [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) no CI e no script `pnpm check:layers`.

Seguimos a **Clean Architecture** de Robert C. Martin (Uncle Bob). A arquitetura interna de cada microsserviço vive em [services/](./services/). O contrato HTTP (saúde e OpenAPI) está em [http.md](./http.md).

## A regra de dependência

As dependências de código apontam **sempre para dentro**. Uma camada interna nunca importa uma camada externa.

```
Frameworks & Drivers  →  Interface Adapters  →  Use Cases  →  Entities
(mais externo)                                              (mais interno)
```

### Layout

A regra é a direção da dependência, não um único mapa de pastas. A interface que o caso de uso precisa é **dele**: mora na camada de Use Cases, em `application/interfaces/`. A classe que a implementa mora em `infrastructure/`, na camada de Interface Adapters (e, quando fala com um SDK, em Frameworks & Drivers). O caso de uso não importa a implementação. A implementação importa a interface. É isso que a regra de dependência exige.

Isso não é a arquitetura hexagonal com o vocabulário de _ports and adapters_. Hexagonal e Clean Architecture invertem a dependência de um jeito parecido, mas não são o mesmo desenho. Aqui o nome da peça é o da Clean Architecture: **interface da camada de casos de uso**, implementada por um **interface adapter**.

| Pasta                 | Camada Uncle Bob                          | Conteúdo                                                                        |
| --------------------- | ----------------------------------------- | ------------------------------------------------------------------------------- |
| `src/domain/`         | Entities                                  | Entidades, value objects, eventos de domínio, erros e policies                  |
| `src/application/`    | Use Cases                                 | Casos de uso, DTOs e interfaces (`interfaces/{repositories,gateways,services}`) |
| `src/infrastructure/` | Interface Adapters + Frameworks & Drivers | Implementações das interfaces, HTTP, messaging, config, observability           |
| `src/main/`           | Composition root                          | Wiring na inicialização                                                         |

`infrastructure/` agrupa as duas camadas externas numa pasta só.

#### Interfaces da camada de casos de uso

Três categorias em `application/interfaces/`, espelhadas em `infrastructure/`:

| Categoria       | Critério                                                          | Exemplos                                                                  |
| --------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `repositories/` | Devolve e recebe **objetos de domínio**                           | `UserRepository`                                                          |
| `gateways/`     | Cruza a fronteira do processo sem falar em termos de domínio      | `ObjectStorage`, `EventPublisher`, `FrameExtractor`                       |
| `services/`     | Capacidade técnica **local** (mesmo processo; sem estado externo) | `PasswordHasher`, `TokenIssuer`, `Clock`, `IdGenerator`, `ArchiveBuilder` |

Pastas vazias não são criadas: a ausência de `interfaces/repositories/` no processor-worker comunica que o contexto é stateless.

`gateway`, neste mapa, é o nome da **interface** que o caso de uso declara para atravessar a fronteira do processo. A classe em `infrastructure/gateways/` é o interface adapter que a implementa. O tipo `PublishPort` de `@zipframes/communication` é contrato daquele pacote, não uma interface desta camada.

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
- **A interface fica para dentro e a implementação para fora.** O caso de uso não importa SDK. A classe que fala com o SDK implementa a interface da camada de casos de uso e mora em `infrastructure/`.

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
