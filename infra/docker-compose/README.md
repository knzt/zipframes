# Infraestrutura local

`pnpm infra:up` sobe o que os dois processos precisam para rodar na máquina, e também containers que nenhum código daqui usa. Não constrói imagem de `auth-service` nem de `processor-worker`.

```bash
pnpm infra:up
```

O atalho é `docker compose -f infra/docker-compose/docker-compose.yml up -d`. O Compose lê `infra/docker-compose/.env` se o arquivo existir. Os `${VAR:-default}` do YAML repetem [`infra/docker-compose/.env.example`](.env.example), então a cópia é opcional.

`pnpm infra:down` para tudo, inclusive o profile `apps`. `pnpm infra:reset` apaga os volumes e sobe de novo só a infra. `pnpm infra:logs` segue o log.

## O que sobe com `infra:up`

| Serviço            | Porta no host | Para quê                                                                  |
| ------------------ | ------------- | ------------------------------------------------------------------------- |
| auth-db            | 5432          | Postgres do auth. `postgres://zipframes:zipframes@localhost:5432/auth_db` |
| video-db           | 5433          | Postgres sem processo neste repositório                                   |
| notification-db    | 5434          | Postgres sem processo neste repositório                                   |
| RabbitMQ (AMQP)    | 5672          | `amqp://zipframes:zipframes@localhost:5672`                               |
| RabbitMQ (painel)  | 15672         | http://localhost:15672                                                    |
| Redis              | 6379          | sem cliente neste repositório                                             |
| SeaweedFS (S3)     | 8333          | `http://localhost:8333`, bucket `videos`                                  |
| SeaweedFS (master) | 9333          | http://localhost:9333/cluster/healthz                                     |
| SeaweedFS (filer)  | 8888          | http://localhost:8888                                                     |
| Mailpit (SMTP)     | 1025          | sem remetente neste repositório                                           |
| Mailpit (web)      | 8025          | http://localhost:8025                                                     |

O `storage-init` cria o bucket `videos` e termina. `Exited (0)` é o estado esperado. As credenciais que ele usa estão em [`seaweedfs/s3.json`](seaweedfs/s3.json) (`zipframes` / `zipframes-local-secret`). Esse JSON não interpola o `.env`.

## Conferir a infra

```bash
docker compose -f infra/docker-compose/docker-compose.yml ps

curl -fsS http://localhost:15672
curl -fsS http://localhost:9333/cluster/healthz

docker run --rm --network zipframes \
  -e AWS_ACCESS_KEY_ID=zipframes \
  -e AWS_SECRET_ACCESS_KEY=zipframes-local-secret \
  -e AWS_DEFAULT_REGION=us-east-1 \
  amazon/aws-cli:2.27.30 --endpoint-url http://storage:8333 s3 ls
```

`auth-db` saudável responde no healthcheck `pg_isready`. O RabbitMQ usa `rabbitmq-diagnostics -q ping`. O Redis usa `redis-cli ping`. O SeaweedFS usa `wget` contra `http://127.0.0.1:9333/cluster/healthz` dentro da imagem `chrislusf/seaweedfs:3.80`.

Com a infra no ar, o caminho dos processos na máquina está no [README da raiz](../../README.md): copiar o `.env` de cada serviço, `db:generate` e `db:deploy` no auth, `pnpm dev` nos dois.

## Processos dentro de container

O profile `apps` constrói e sobe os dois. O worker só entra na imagem se `dist/` e `.runtime/node_modules` já existirem no contexto. O auth instala o lockfile dele no build e lê `NODE_AUTH_TOKEN` como secret.

```bash
export NODE_AUTH_TOKEN
pnpm --dir services/processor-worker build
pnpm --dir services/processor-worker stage-runtime
pnpm infra:apps
```

`pnpm infra:apps` é `docker compose ... --profile apps up -d --build`. O container do auth aplica as migrations na subida (`prisma migrate deploy`) e escuta na porta 3000. O worker consome AMQP e não publica porta HTTP. A chave montada no auth é `infra/docker-compose/auth/jwt-dev.pem`, com `JWT_KID=auth-dev-1`.

```bash
curl -fsS http://localhost:3000/health/ready
```

`GET /health/ready` do auth exige Postgres e RabbitMQ. `GET /health/live` e `GET /metrics` existem no auth. `GET /docs` publica o OpenAPI. O worker usa healthcheck exec (`kill -0 1`).

Não rode o mesmo processo na máquina e no container ao mesmo tempo: os dois usam a porta 3000 no auth.

## O que este Compose não é

- Não substitui o Kubernetes. `infra/k8s/` não cria banco, broker nem storage. O Secret de exemplo fica de fora do Kustomize. O `ScaledObject` do worker exige o CRD do KEDA.
- As credenciais são de desenvolvimento. Não as reuse fora desta máquina.
- O volume server do SeaweedFS não é publicado, para não ocupar a porta 8080. O acesso é o gateway S3, na 8333.
