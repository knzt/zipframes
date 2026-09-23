# Infraestrutura local

Sobe tudo de que os serviços do ZipFrames precisam para rodar na máquina: bancos, broker, cache, object storage e captura de e-mails.

## Subir

```bash
cp infra/docker-compose/.env.example infra/docker-compose/.env
docker compose -f infra/docker-compose/docker-compose.yml up -d
```

Na raiz do monorepo, os atalhos equivalentes são `pnpm infra:up`, `pnpm infra:down`, `pnpm infra:logs` e `pnpm infra:reset`.

## Serviços e portas

| Serviço            | Porta | Acesso                                                          |
| ------------------ | ----- | --------------------------------------------------------------- |
| auth-db            | 5432  | `postgres://zipframes:zipframes@localhost:5432/auth_db`         |
| video-db           | 5433  | `postgres://zipframes:zipframes@localhost:5433/video_db`        |
| notification-db    | 5434  | `postgres://zipframes:zipframes@localhost:5434/notification_db` |
| RabbitMQ (AMQP)    | 5672  | `amqp://zipframes:zipframes@localhost:5672`                     |
| RabbitMQ (painel)  | 15672 | http://localhost:15672                                          |
| Redis              | 6379  | `redis://localhost:6379`                                        |
| SeaweedFS (S3)     | 8333  | `http://localhost:8333`, bucket `videos`                        |
| SeaweedFS (master) | 9333  | http://localhost:9333                                           |
| SeaweedFS (filer)  | 8888  | http://localhost:8888                                           |
| Mailpit (SMTP)     | 1025  | `smtp://localhost:1025`                                         |
| Mailpit (web)      | 8025  | http://localhost:8025                                           |
| auth-service       | 3000  | http://localhost:3000/health/ready                              |
| processor-worker   | 8081  | http://localhost:8081/readyz                                    |
| processor-worker   | 9091  | http://localhost:9091/metrics                                   |

As três instâncias de PostgreSQL existem para manter o isolamento real entre serviços

## Verificar

```bash
# estado dos containers, com healthcheck
docker compose -f infra/docker-compose/docker-compose.yml ps

# o bucket foi criado?
docker run --rm --network zipframes \
  -e AWS_ACCESS_KEY_ID=zipframes \
  -e AWS_SECRET_ACCESS_KEY=zipframes-local-secret \
  -e AWS_DEFAULT_REGION=us-east-1 \
  amazon/aws-cli:2.27.30 --endpoint-url http://storage:8333 s3 ls
```

O container `storage-init` cria o bucket `videos` na primeira subida e encerra. Vê-lo como `Exited (0)` é o comportamento esperado.

O `processor-worker` sobe junto. Antes do build da imagem, no serviço:

```bash
pnpm --dir services/processor-worker build
pnpm --dir services/processor-worker stage-runtime
```

`stage-runtime` monta os `node_modules` de produção já instalados. O build da imagem não baixa `@zipframes/*` de novo. Com RabbitMQ e o bucket saudáveis, `GET /readyz` responde 200.

O `auth-service` também sobe junto. A imagem instala as dependências durante o build, então `NODE_AUTH_TOKEN` precisa estar exportado. A chave RS256 de desenvolvimento está em `infra/docker-compose/auth/jwt-dev.pem` e só vale para esta máquina. O processo aplica as migrations e então escuta; `GET /health/ready` responde 200 com o Postgres e o RabbitMQ alcançáveis.

## Zerar tudo

```bash
docker compose -f infra/docker-compose/docker-compose.yml down -v
```

O `-v` apaga os volumes, ou seja, todos os dados e arquivos enviados.

## Observações

- **As credenciais aqui são apenas de desenvolvimento.** Em Kubernetes elas vêm de Secrets.
- **`seaweedfs/s3.json` não interpola variáveis de ambiente.** Ao mudar `STORAGE_ACCESS_KEY` ou `STORAGE_SECRET_KEY` no `.env`, ajuste o mesmo valor nesse arquivo.
- **O volume server do SeaweedFS não é publicado** para não ocupar a porta 8080 da máquina. O acesso acontece pelo gateway S3, na 8333.
- **Prometheus, Grafana e Jaeger não estão aqui.** Eles entram na fase de observabilidade, em um Compose próprio, para não pesar no dia a dia.
