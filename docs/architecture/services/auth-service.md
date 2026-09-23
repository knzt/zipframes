# Arquitetura: auth-service

Clean Architecture aplicada ao contexto de **Identidade** do ZipFrames.

Referências: [dominio.md — Identidade](../../domain/dominio.md), [OpenAPI](../../openapi/auth-service.yaml), [AsyncAPI](../../asyncapi/events.yaml), [modelagem de dados](../../data/modelagem-de-dados.md).

## Objetivo do serviço

Cadastrar usuário, autenticar e emitir JWT RS256. Publicar `user.registered` pelo outbox, na mesma transação do `INSERT` em `users`. Os outros serviços validam o token contra o JWKS publicado aqui. Este serviço não conhece vídeo, fila de processamento nem object storage.

## Camadas

As dependências apontam para dentro.

```
Frameworks & Drivers  →  Interface Adapters  →  Use Cases  →  Entities
```

| Camada                                    | Pasta                 | O que há aqui                                                                                                |
| ----------------------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------ |
| Entities                                  | `src/domain/`         | `User`, `Password`, `UserRegistered`, e os contratos `UserRepository` e `PasswordHasher`                     |
| Use Cases                                 | `src/application/`    | `register-user`, `login`, e as interfaces que existem por causa do caso de uso (`TokenIssuer`, relógio, ids) |
| Interface Adapters + Frameworks & Drivers | `src/infrastructure/` | Gateway Prisma, bcrypt, RS256, rotas HTTP, relay do outbox                                                   |
| Composition root                          | `src/main/`           | `compose.ts` monta o grafo; `index.ts` trata sinal e shutdown                                                |

O **gateway** é a classe de fora. `PrismaUserRepository` implementa `UserRepository` e mora em `infrastructure/repositories/`. A interface fica no domínio, ao lado de `User`, porque persistir e buscar usuário é contrato da entidade. O caso de uso chama a interface e não importa Prisma.

## Casos de uso

| Caso de uso    | O que faz                                                                                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `registerUser` | Valida a senha, pede o hash, monta o `User` e entrega `User` + `UserRegistered` ao repositório. E-mail duplicado volta `EMAIL_TAKEN`.                                |
| `login`        | Normaliza o e-mail, busca o usuário e compara a senha. E-mail desconhecido também passa pelo `verify`, para não ser mais rápido que uma senha errada. Emite o token. |

Falha de login é sempre `INVALID_CREDENTIALS`.

## Outbox

O gateway grava a linha de `outbox` na mesma transação do usuário. O relay publica o que está pendente.

- Intervalo: `OUTBOX_INTERVAL_MS` (padrão 2s).
- Teto: `OUTBOX_MAX_ATTEMPTS` (padrão 30), cerca de um minuto de broker fora do ar.
- Falha de publish incrementa `attempts` e deixa `published_at` nulo.
- A busca é `published_at IS NULL AND attempts < max`, pela ordem de `occurred_at`, com `FOR UPDATE SKIP LOCKED`.
- Ao atingir o teto a linha sai do ciclo e permanece na tabela. A limpeza de 7 dias só remove linhas publicadas.
- Nesse momento o relay registra erro (id, `eventType`, `attempts`, `correlationId`) e incrementa `outbox_exhausted_total`.
- Linha esgotada não muda `/health/ready`.

A transação do relay continua aberta durante o round-trip do broker.

## HTTP

| Método e path                | Papel                                                               |
| ---------------------------- | ------------------------------------------------------------------- |
| `POST /register`             | Cadastro                                                            |
| `POST /login`                | Token                                                               |
| `GET /.well-known/jwks.json` | Chave pública                                                       |
| `GET /health/live`           | Processo de pé                                                      |
| `GET /health/ready`          | 200 com Postgres (`SELECT 1`) e AMQP conectados; 503 caso contrário |
| `GET /metrics`               | Texto Prometheus, incluindo `outbox_exhausted_total`                |

Tudo na porta `3000`.

## Onde o processo sobe

Na máquina, o Compose sobe o serviço na rede `zipframes`, depois de `auth-db` e RabbitMQ saudáveis, aplica as migrations e usa a chave de desenvolvimento em `infra/docker-compose/auth/jwt-dev.pem`.

No cluster, o Argo CD aplica [`infra/k8s/auth-service`](../../../infra/k8s/auth-service) pela Application [`infra/argocd/auth-service.yaml`](../../../infra/argocd/auth-service.yaml). A escala é HPA por CPU (mínimo 1, máximo 3, alvo 70%). O Secret fica de fora desse apply.

## Testes

`tests/unit` cobre domínio, casos de uso, HTTP, crypto, config, envelope e o contador do outbox, com as interfaces substituídas. A barra nesses arquivos é 100%. O gateway Prisma, o relay e `main/index.ts` ficam de fora: dependem de Postgres e do broker de verdade.
