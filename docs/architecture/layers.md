# Regras de camadas (Clean Architecture)

Este documento descreve as regras de dependência entre camadas, verificadas automaticamente pelo [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) no CI e no script `pnpm check:layers`.

Seguimos a **Clean Architecture** de Robert C. Martin (Uncle Bob). A arquitetura interna de cada microsserviço (mapa de pastas, contratos e gateways) vive em [services/](./services/).

## A regra de dependência

As dependências de código apontam **sempre para dentro**. Uma camada interna nunca importa uma camada externa.

```
Frameworks & Drivers  →  Interface Adapters  →  Use Cases  →  Entities
(mais externo)                                              (mais interno)
```

### Layout

A regra é a direção da dependência, não um único mapa de pastas. A interface fica na camada que define a regra. O **gateway** é a classe de fora que implementa essa interface e fala com um banco, um broker ou uma biblioteca. Ela vive em `infrastructure/`.

| Pasta                 | Camada Uncle Bob                          | Conteúdo                                                                                          |
| --------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `src/domain/`         | Entities                                  | Conceitos, regras e contratos do contexto (o repositório de um agregado, quando ele é do domínio) |
| `src/application/`    | Use Cases                                 | Casos de uso e interfaces que existem por causa do caso de uso                                    |
| `src/infrastructure/` | Interface Adapters + Frameworks & Drivers | Gateways, controllers, clientes (amqplib, S3, Prisma, Fastify…)                                   |
| `src/main/`           | Composition root                          | Wiring na inicialização                                                                           |

`infrastructure/` agrupa as duas camadas externas numa pasta só. `application/gateways/` é um lugar válido quando a interface pertence ao caso de uso, como no [processor-worker](./services/processor-worker.md). O [auth-service](./services/auth-service.md) declara `UserRepository` em `domain/` e implementa o gateway em `infrastructure/repositories/`.

### Dependência externa

O código que importa um SDK mora em `src/infrastructure/`. A interface que esse código implementa mora na camada da regra: `domain/` quando o contrato é da entidade, `application/` quando o contrato existe para o caso de uso. `main/` instancia o SDK e entrega a classe pronta ao caso de uso.

Tudo o que pertence a um SDK fica na pasta desse gateway. Para o Prisma, schema, migrations, client e o repositório concreto ficam juntos em `src/infrastructure/repositories/prisma/`. O `package.json` aponta `prisma.schema` para esse schema; `prisma generate` e `prisma migrate` seguem esse caminho.

### Layout legado

Alguns esboços antigos usavam `src/adapters/` + `src/frameworks/`. O dependency-cruiser ainda rejeita violações nesse layout. Serviços novos **não** devem criá-lo.

## O que cada pasta pode importar

| Pasta                 | Pode importar                                                                | Nunca pode importar                                                                           |
| --------------------- | ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `src/domain/`         | Biblioteca padrão, `@types/*`, `@zipframes/core`, `@zipframes/value-objects` | `application/`, `infrastructure/`, `adapters/`, `frameworks/`, `main/`, libs de infra         |
| `src/application/`    | `domain/`, pacotes `@zipframes/*` de contrato                                | `infrastructure/`, `adapters/`, `frameworks/`, `main/`, Prisma, amqplib, `@aws-sdk`, Fastify… |
| `src/infrastructure/` | `application/`, `domain/`, bibliotecas de integração                         | `main/`                                                                                       |
| `src/main/`           | Todas as camadas                                                             | —                                                                                             |

O `main/` é a única exceção que conhece todas as camadas para montar o grafo.

## Regras de microsserviços

- **Serviços não importam outros serviços.** Código compartilhado vem dos pacotes npm `@zipframes/*`, por versão.
- **Política fica no serviço.** O pacote valida forma (ex.: e-mail); o serviço decide política de negócio.
- **A interface fica para dentro e o gateway para fora.** O caso de uso não importa SDK. A classe que fala com o SDK implementa a interface e mora em `infrastructure/`.

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
   - Extrair a interface na camada que define a regra (`domain/` ou `application/`) e injetar o gateway pelo `main/`.
   - Publicar código técnico universal em um pacote `@zipframes/*`.
3. Nunca suprima a regra sem comentário explicando o porquê.

## Configuração do dependency-cruiser

Arquivo: [`.dependency-cruiser.mjs`](../../.dependency-cruiser.mjs). Regras `forbidden` cobrem `domain/`, `application/`, `infrastructure/` e o layout legado `adapters/`/`frameworks/`.
