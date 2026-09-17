# Regras de camadas (Clean Architecture)

Este documento descreve as regras de dependência entre camadas, verificadas automaticamente pelo [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) no CI e no script `pnpm check:layers`.

## A regra de dependência

As dependências no código sempre apontam **de fora para dentro**. Uma camada interna nunca importa uma camada externa.

```
frameworks  →  adapters  →  application  →  domain
(mais externo)                              (mais interno)
```

O `main/` (composition root) é a única exceção: ele conhece todas as camadas para montar o grafo de dependências na inicialização.

## Camadas por pasta

| Pasta | Camada | Pode importar | Nunca pode importar |
|---|---|---|---|
| `src/domain/` | Entities | Biblioteca padrão, `@types/*` | Qualquer outra camada, bibliotecas de infraestrutura |
| `src/application/` | Use Cases | `domain/`, `packages/*` | `adapters/`, `frameworks/`, `main/`, Prisma, amqplib, ioredis, `@aws-sdk`, Nodemailer, Fastify |
| `src/adapters/` | Interface Adapters | `application/`, `domain/`, bibliotecas de integração | `frameworks/`, `main/` |
| `src/frameworks/` | Frameworks & Drivers | `adapters/`, bibliotecas | `main/` |
| `src/main/` | Composition root | Todas as camadas | — |

## Regras de microsserviços

- **Serviços não importam outros serviços.** Todo código compartilhado vai para `packages/`.
- **Packages não importam serviços.** Dependências em `packages/` apontam apenas para outros `packages/` ou para `node_modules`.

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
   - Extrair uma interface (port) em `application/ports/` e injetar a implementação pelo `main/`.
   - Mover código reutilizável para `packages/` se for técnico, sem regra de negócio.
3. Nunca suprima a regra sem deixar um comentário explicando por quê.

## Como o dependency-cruiser é configurado

A configuração está em `.dependency-cruiser.mjs` na raiz do monorepo. Ela usa a API de `forbidden` para declarar o que **não** é permitido, o que torna as violações explícitas e fáceis de entender.

As regras de camadas são verificadas apenas em `src/` de cada serviço e pacote. Arquivos de teste (`*.test.ts`, `*.spec.ts`) e de configuração ficam fora da verificação.
