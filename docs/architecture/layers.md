# Regras de camadas (Clean Architecture)

Este documento descreve as regras de dependência entre camadas, verificadas automaticamente pelo [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) no CI e no script `pnpm check:layers`.

Seguimos a **Clean Architecture** de Robert C. Martin (Uncle Bob). A arquitetura interna de cada microsserviço (mapa de pastas, portas e adapters) vive em [services/](./services/).

## A regra de dependência

As dependências de código apontam **sempre para dentro**. Uma camada interna nunca importa uma camada externa.

```
Frameworks & Drivers  →  Interface Adapters  →  Use Cases  →  Entities
(mais externo)                                              (mais interno)
```

### Layout

A regra é a direção da dependência, não um único mapa de pastas. A interface (porta) fica na camada que define a regra — em ZipFrames, nas portas de `application/`. A implementação fica em `infrastructure/`.

| Pasta                 | Camada Uncle Bob                          | Conteúdo                                                               |
| --------------------- | ----------------------------------------- | ---------------------------------------------------------------------- |
| `src/domain/`         | Entities                                  | Entidades, value objects, eventos de domínio, erros e policies         |
| `src/application/`    | Use Cases                                 | Casos de uso, DTOs e portas (`ports/{repositories,gateways,services}`) |
| `src/infrastructure/` | Interface Adapters + Frameworks & Drivers | Implementações das portas, HTTP, messaging, config, observability      |
| `src/main/`           | Composition root                          | Wiring na inicialização                                                |

`infrastructure/` agrupa as duas camadas externas numa pasta só.

#### Portas: repository, gateway e service

Três categorias em `application/ports/`, espelhadas em `infrastructure/`:

| Categoria       | Critério                                                          | Exemplos                                                                  |
| --------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `repositories/` | Devolve e recebe **objetos de domínio**                           | `UserRepository`                                                          |
| `gateways/`     | Cruza a fronteira do processo sem falar em termos de domínio      | `ObjectStorage`, `EventPublisher`, `FrameExtractor`                       |
| `services/`     | Capacidade técnica **local** (mesmo processo; sem estado externo) | `PasswordHasher`, `TokenIssuer`, `Clock`, `IdGenerator`, `ArchiveBuilder` |

Pastas vazias não são criadas: a ausência de `ports/repositories/` no processor-worker comunica que o contexto é stateless.

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

O código que importa um SDK mora em `src/infrastructure/`. A interface que esse código implementa mora em `application/ports/`. `main/` instancia o SDK e entrega a implementação ao caso de uso.

Tudo o que pertence a um ORM fica na pasta desse repository. Para o Prisma, schema, migrations, client e o repositório concreto ficam juntos em `src/infrastructure/repositories/prisma/`.

### Falhas: `Result` vs `throw`

- **auth-service** usa `Result<T, E>` (`@zipframes/core`) nas portas e nos casos de uso.
- **processor-worker** lança erros com `retryable: boolean` (mesmo vocabulário de `InfrastructureError` em `@zipframes/core`), adequado a um pipeline com I/O externo.

Não misturar os dois estilos dentro do mesmo caso de uso.

### Health e readiness

Contrato único em todo serviço:

| Path                | Papel                                               |
| ------------------- | --------------------------------------------------- |
| `GET /health/live`  | Processo de pé                                      |
| `GET /health/ready` | Dependências alcançáveis (JSON com `reason` em 503) |
| `GET /metrics`      | Prometheus                                          |

Uma porta só. Checagens usam `Pingable` + `createReadinessCheck` de `@zipframes/core` (ISP: `ping` não entra nas interfaces de negócio).

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
- **A interface fica para dentro e a implementação para fora.** O caso de uso não importa SDK. A classe que fala com o SDK implementa a porta e mora em `infrastructure/`.

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
   - Extrair a porta em `application/ports/` e injetar a implementação pelo `main/`.
   - Publicar código técnico universal em um pacote `@zipframes/*`.
3. Nunca suprima a regra sem comentário explicando o porquê.

## Configuração do dependency-cruiser

Arquivo: [`.dependency-cruiser.mjs`](../../.dependency-cruiser.mjs). Regras `forbidden` cobrem `domain/`, `application/`, `infrastructure/` e `main/`.
