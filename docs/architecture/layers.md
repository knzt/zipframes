# Regras de camadas (Clean Architecture)

Este documento descreve as regras de dependência entre camadas, verificadas automaticamente pelo [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) no CI e no script `pnpm check:layers`.

Seguimos a **Clean Architecture** de Robert C. Martin (Uncle Bob). A arquitetura interna de cada microsserviço (mapa de pastas, gateways, fluxos) vive em [services/](./services/). Referência completa do worker: [processor-worker.md](./services/processor-worker.md).

## A regra de dependência

As dependências de código apontam **sempre para dentro**. Uma camada interna nunca importa uma camada externa.

```
Frameworks & Drivers  →  Interface Adapters  →  Use Cases  →  Entities
(mais externo)                                              (mais interno)
```

### Layout preferido (serviços novos)

| Pasta                 | Camada Uncle Bob                          | Conteúdo                                                              |
| --------------------- | ----------------------------------------- | --------------------------------------------------------------------- |
| `src/domain/`         | Entities                                  | Conceitos e regras do contexto                                        |
| `src/application/`    | Use Cases                                 | Casos de uso + **interfaces de gateway** (`application/gateways/`)    |
| `src/infrastructure/` | Interface Adapters + Frameworks & Drivers | Consumers, implementações de gateway, clientes (amqplib, S3, Prisma…) |
| `src/main/`           | Composition root                          | Wiring na inicialização                                               |

`infrastructure/` agrupa as duas camadas externas numa pasta só. Saídas do use case são **gateways**: interface em `application/gateways/`, implementação em `infrastructure/gateways/`.

### Layout legado

Alguns esboços antigos usavam `src/adapters/` + `src/frameworks/`. O dependency-cruiser ainda rejeita violações nesse layout. Serviços novos **não** devem criá-lo.

## O que cada pasta pode importar

| Pasta                 | Pode importar                                                                                   | Nunca pode importar                                                                           |
| --------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/domain/`         | Biblioteca padrão, `@types/*`, `@zipframes/core`, `@zipframes/value-objects`                    | `application/`, `infrastructure/`, `adapters/`, `frameworks/`, `main/`, libs de infra         |
| `src/application/`    | `domain/`, pacotes `@zipframes/*` de contrato (ex.: schemas só se inevitável; preferir gateway) | `infrastructure/`, `adapters/`, `frameworks/`, `main/`, Prisma, amqplib, `@aws-sdk`, Fastify… |
| `src/infrastructure/` | `application/`, `domain/`, bibliotecas de integração                                            | `main/`                                                                                       |
| `src/main/`           | Todas as camadas                                                                                | —                                                                                             |

O `main/` é a única exceção que conhece todas as camadas para montar o grafo.

## Regras de microsserviços

- **Serviços não importam outros serviços.** Código compartilhado vem dos pacotes npm `@zipframes/*`, por versão.
- **Política fica no serviço.** O pacote valida forma (ex.: e-mail); o serviço decide política de negócio.
- **Saídas do use case são gateways**, não imports diretos de SDK.

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
```

## O que fazer quando uma violação é encontrada

1. Leia o nome da regra na saída.
2. Opções comuns:
   - Mover o código para a camada correta.
   - Extrair uma interface de gateway em `application/gateways/` e injetar a implementação pelo `main/`.
   - Publicar código técnico universal em um pacote `@zipframes/*`.
3. Nunca suprima a regra sem comentário explicando o porquê.

## Configuração do dependency-cruiser

Arquivo: [`.dependency-cruiser.mjs`](../../.dependency-cruiser.mjs). Regras `forbidden` cobrem `domain/`, `application/`, `infrastructure/` e o layout legado `adapters/`/`frameworks/`.
