# Kubernetes local (kind)

`infra/kind/bootstrap.sh` cria o cluster `zipframes` no kind e sobe tudo o que os quatro processos precisam. Rodar de novo é seguro: os Secrets que já existem são mantidos, porque os bancos foram inicializados com eles.

## Pré-requisitos

- Docker, com pelo menos 6 GB de memória para o Docker Desktop
- [kind](https://kind.sigs.k8s.io/) 0.33 e `kubectl`
- `openssl` e `bash` (no Windows, o Git Bash traz os dois)
- Portas 80 e 443 livres no host: o Traefik recebe o tráfego por elas

## Dois modos

| Comando                                         | O que aplica                                                  | Quando usar                               |
| ----------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------- |
| `infra/kind/bootstrap.sh`                       | Argo CD sincroniza `infra/` a partir do `main`                | Ambiente de demonstração, GitOps          |
| `infra/kind/bootstrap.sh --local`               | `kubectl apply` desta cópia de trabalho, sem Argo CD          | Testar mudança de manifest antes do merge |
| `infra/kind/bootstrap.sh --local --load-images` | O mesmo, com as imagens construídas aqui e carregadas no kind | Testar mudança de código antes do merge   |

O modo Argo CD lê um repositório privado. Exporte `GITHUB_TOKEN` com leitura do repositório (um token fine-grained com `Contents: read` basta). As imagens vêm de `ghcr.io/knzt/zipframes-<serviço>:main`, que precisam estar públicas no GHCR.

`--load-images` constrói pelo Compose e precisa de `NODE_AUTH_TOKEN` e do `pnpm install` feito em `services/processor-worker`. Os Deployments passam a usar `imagePullPolicy: Never`, então o kind não tenta o GHCR.

## O que o bootstrap instala

| Peça                        | Versão | Onde                                                           |
| --------------------------- | ------ | -------------------------------------------------------------- |
| cert-manager                | 1.21.2 | `cert-manager`, certificado do webhook do operator do RabbitMQ |
| CloudNativePG               | 1.30.1 | `cnpg-system`, três `Cluster` (um por serviço)                 |
| RabbitMQ Cluster Operator   | 2.23.0 | `rabbitmq-system`, um `RabbitmqCluster`                        |
| KEDA                        | 2.21.0 | `keda`, escala o worker pela fila `processor.video.uploaded`   |
| metrics-server              | 0.9.0  | `kube-system`, alimenta os HPAs do auth e do video             |
| Traefik                     | 3.7.13 | `traefik`, manifests em [`traefik.yaml`](traefik.yaml)         |
| Argo CD (só no modo padrão) | 3.5.3  | `argocd`                                                       |

As instâncias (Postgres, RabbitMQ, Redis, SeaweedFS, Mailpit e o Ingress delas) estão em [`infra/k8s/platform/`](../k8s/platform/). Os operators e o Traefik ficam no bootstrap porque são do cluster, não do ZipFrames.

## Segredos

Nenhum Secret real está no Git. O bootstrap gera:

| Secret                                                                  | Conteúdo                                                                                                    |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `<auth,video,notification>-db-credentials`                              | usuário `zipframes` e senha aleatória; o CNPG cria o banco com eles                                         |
| `seaweedfs-s3`                                                          | `s3.json` e o par de chaves do S3                                                                           |
| `auth-jwt`                                                              | chave RSA 2048 do auth                                                                                      |
| `auth-service`, `video-service`, `processor-worker`, `notifier-service` | as variáveis de cada processo, montadas a partir dos acima e do `rabbitmq-default-user` que o operator cria |

Os `secret.example.yaml` em `infra/k8s/<serviço>/` mostram o formato e não entram no Kustomize.

## Endereços

`*.localhost` resolve para 127.0.0.1 no navegador e no curl, sem editar o arquivo de hosts.

| Host                                | Destino                                |
| ----------------------------------- | -------------------------------------- |
| http://auth.zipframes.localhost     | auth-service                           |
| http://api.zipframes.localhost      | video-service                          |
| http://storage.zipframes.localhost  | SeaweedFS (URLs de download assinadas) |
| http://mail.zipframes.localhost     | Mailpit                                |
| http://rabbitmq.zipframes.localhost | painel do RabbitMQ                     |

O fluxo do [README](../../README.md#o-fluxo-completo) funciona trocando `localhost:3000` por `auth.zipframes.localhost` e `localhost:3001` por `api.zipframes.localhost`.

Usuário do painel do RabbitMQ:

```bash
kubectl -n zipframes get secret rabbitmq-default-user -o jsonpath='{.data.username}' | base64 -d
kubectl -n zipframes get secret rabbitmq-default-user -o jsonpath='{.data.password}' | base64 -d
```

Argo CD:

```bash
kubectl -n argocd port-forward svc/argocd-server 8080:443
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d
```

## Entrega contínua

O merge no `main` roda o workflow do serviço. Com testes e integração verdes, o job `Publish to GHCR` envia a imagem testada como `:<sha>` e `:main`. O `workflow_dispatch` de cada workflow publica o `main` atual sem mudança de código (por exemplo, a primeira imagem).

Os manifests usam `:main` com `imagePullPolicy: Always` e a tag nos manifests não muda a cada publicação. O Argo CD entrega mudança de manifest sozinho; imagem nova entra no próximo restart:

```bash
kubectl -n zipframes rollout restart deployment/video-service
```

Para voltar a uma versão, `kubectl -n zipframes set image deployment/video-service video-service=ghcr.io/knzt/zipframes-video-service:<sha>`. O Argo CD desfaz isso no próximo sync, então é para investigação, não para rollback duradouro.

## Remover

```bash
kind delete cluster --name zipframes
```
