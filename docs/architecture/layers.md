# Regras de camadas (Clean Architecture)

Este documento descreve as regras de dependência entre camadas, verificadas automaticamente pelo [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) no CI e no script `pnpm check:layers`.

A arquitetura **interna** de cada microsserviço (mapa de pastas, gateways, fluxos) vive em [services/](./services/). O primeiro detalhado é o [processor-worker](./services/processor-worker.md), que segue o vocabulário de Uncle Bob (`domain` / `application` / `infrastructure` / `main`, com **gateways** de saída).

## A regra de dependência

As dependências no código sempre apontam **de fora para dentro**. Uma camada interna nunca importa uma camada externa.

```
Frameworks & Drivers  →  Interface Adapters  →  Use Cases  →  Entities
(mais externo)                                              (mais interno)
```

No monorepo isso pode aparecer como pastas `frameworks/` + `adapters/`, ou — preferido nos serviços novos — como uma única pasta `infrastructure/` que agrupa Interface Adapters e Frameworks & Drivers, com interfaces de **gateway** em `application/`.

O `main/` (composition root) é a única exceção: ele conhece todas as camadas para montar o grafo de dependências na inicialização.

## Camadas por pasta

A tabela inclui o layout legado (`adapters/` + `frameworks/`) e o layout preferido (`infrastructure/`). Serviços novos devem seguir o documentado em [services/](./services/).

| Pasta                 | Camada                                    | Pode importar                                        | Nunca pode importar                                                                                               |
| --------------------- | ----------------------------------------- | ---------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `src/domain/`         | Entities                                  | Biblioteca padrão, `@types/*`                        | Qualquer outra camada, bibliotecas de infraestrutura                                                              |
| `src/application/`    | Use Cases (+ interfaces de gateway)       | `domain/`, pacotes `@zipframes/*`                    | `adapters/`, `frameworks/`, `infrastructure/`, `main/`, Prisma, amqplib, ioredis, `@aws-sdk`, Nodemailer, Fastify |
| `src/adapters/`       | Interface Adapters (legado)               | `application/`, `domain/`, bibliotecas de integração | `frameworks/`, `main/`                                                                                            |
| `src/frameworks/`     | Frameworks & Drivers (legado)             | `adapters/`, bibliotecas                             | `main/`                                                                                                           |
| `src/infrastructure/` | Interface Adapters + Frameworks & Drivers | `application/`, `domain/`, bibliotecas               | `main/` (só o composition root monta)                                                                             |
| `src/main/`           | Composition root                          | Todas as camadas                                     | —                                                                                                                 |

## Regras de microsserviços

- **Serviços não importam outros serviços.** O código compartilhado vem dos pacotes npm `@zipframes/*`, publicados a partir de um repositório próprio e declarados por versão em cada serviço.
- **O domínio pode importar `@zipframes/value-objects` e `@zipframes/core`**, porque eles carregam apenas forma (o que é válido em qualquer sistema) e nenhuma dependência de infraestrutura. Qualquer outro pacote npm continua proibido no domínio.
- **Política fica no serviço.** O pacote diz se um e-mail tem formato válido; o serviço diz se aquele e-mail pode se cadastrar. Regras como política de senha, extensões de vídeo aceitas e status do vídeo pertencem ao domínio de quem as define.
- **Saídas do use case são gateways.** A interface fica em `application/gateways/`; a implementação fica em `infrastructure/gateways/`.

## Regras adicionais

- **Sem dependências cíclicas** em nenhuma camada.
- **Vitest só em arquivos de teste** (`*.test.ts` e `*.spec.ts`).

## Como verificar localmente

```bash
pnpm check:layers
```

## O que fazer quando uma violação é encontrada

1. Leia o nome da regra na saída: ele descreve o problema diretamente.
2. Opções comuns:
   - Mover o código para a camada correta.
   - Extrair uma interface de gateway em `application/gateways/` e injetar a implementação pelo `main/`.
   - Publicar o código em um pacote `@zipframes/*` se ele for técnico ou universal, sem regra de negócio de nenhum contexto.
3. Nunca suprima a regra sem deixar um comentário explicando por quê.

## Como o dependency-cruiser é configurado

A configuração está em `.dependency-cruiser.mjs` na raiz do monorepo. Ela usa a API de `forbidden` para declarar o que **não** é permitido, o que torna as violações explícitas e fáceis de entender.

As regras de camadas são verificadas apenas em `src/` de cada serviço e pacote. Arquivos de teste (`*.test.ts`, `*.spec.ts`) e de configuração ficam fora da verificação.
