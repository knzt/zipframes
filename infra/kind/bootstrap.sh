#!/usr/bin/env bash
# Creates the kind cluster and everything ZipFrames runs on.
#
#   infra/kind/bootstrap.sh                   Argo CD syncs infra/ from main
#   infra/kind/bootstrap.sh --local           kubectl applies this working tree
#   infra/kind/bootstrap.sh --local --load-images
#                                             same, with images built here
#
# Argo CD mode reads a private repository: export GITHUB_TOKEN with
# read access to it (a fine-grained token with Contents: read is enough).
# --load-images builds with Compose, so it needs NODE_AUTH_TOKEN and
# `pnpm install` done in services/processor-worker.
#
# Running it again is safe: secrets that already exist are kept, because
# the databases were initialized with them.
set -euo pipefail

CLUSTER=zipframes
CONTEXT="kind-${CLUSTER}"
NS=zipframes
REPO_URL=https://github.com/knzt/zipframes.git
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

CNPG_URL=https://raw.githubusercontent.com/cloudnative-pg/cloudnative-pg/release-1.30/releases/cnpg-1.30.1.yaml
RABBITMQ_OPERATOR_URL=https://github.com/rabbitmq/cluster-operator/releases/download/v2.23.0/cluster-operator.yml
KEDA_URL=https://github.com/kedacore/keda/releases/download/v2.21.0/keda-2.21.0.yaml
METRICS_SERVER_URL=https://github.com/kubernetes-sigs/metrics-server/releases/download/v0.9.0/components.yaml
ARGOCD_URL=https://raw.githubusercontent.com/argoproj/argo-cd/v3.5.3/manifests/install.yaml

SERVICES=(auth-service video-service processor-worker notifier-service)
DATABASES=(auth video notification)

MODE=argocd
LOAD_IMAGES=0
for arg in "$@"; do
  case "$arg" in
    --local) MODE=local ;;
    --load-images) LOAD_IMAGES=1 ;;
    -h | --help) sed -n '2,16p' "$0"; exit 0 ;;
    *) echo "unknown option: $arg" >&2; exit 2 ;;
  esac
done
if [ "$LOAD_IMAGES" = 1 ] && [ "$MODE" != local ]; then
  echo "--load-images only works with --local: Argo CD would put imagePullPolicy: Always back." >&2
  exit 2
fi

k() { kubectl --context "$CONTEXT" "$@"; }
step() { printf '\n==> %s\n' "$*"; }

need() {
  for cmd in "$@"; do
    command -v "$cmd" > /dev/null || { echo "missing: $cmd" >&2; exit 1; }
  done
}
need kind kubectl docker openssl base64

has_secret() { k -n "$NS" get secret "$1" > /dev/null 2>&1; }
secret_value() { k -n "$NS" get secret "$1" -o "jsonpath={.data.$2}" | base64 -d; }
# Creates or updates without failing on an existing Secret.
apply_secret() { k -n "$NS" create secret generic "$@" --dry-run=client -o yaml | k apply -f - > /dev/null; }

wait_for() {
  local what="$1" tries="$2"
  shift 2
  for _ in $(seq "$tries"); do
    if "$@" > /dev/null 2>&1; then return 0; fi
    sleep 5
  done
  echo "timed out waiting for $what" >&2
  return 1
}

step "Cluster"
if kind get clusters | grep -qx "$CLUSTER"; then
  echo "kind cluster $CLUSTER already exists"
else
  kind create cluster --config "$ROOT/infra/kind/cluster.yaml"
fi

step "Operators, autoscaling and Traefik"
k apply --server-side -f "$CNPG_URL" > /dev/null
k apply --server-side -f "$RABBITMQ_OPERATOR_URL" > /dev/null
k apply --server-side -f "$KEDA_URL" > /dev/null
k apply -f "$METRICS_SERVER_URL" > /dev/null
# The kubelet certificates in kind are self-signed.
if ! k -n kube-system get deployment metrics-server -o jsonpath='{.spec.template.spec.containers[0].args}' | grep -q kubelet-insecure-tls; then
  k -n kube-system patch deployment metrics-server --type=json \
    -p '[{"op":"add","path":"/spec/template/spec/containers/0/args/-","value":"--kubelet-insecure-tls"}]' > /dev/null
fi
k apply -f "$ROOT/infra/kind/traefik.yaml" > /dev/null
k -n cnpg-system rollout status deployment/cnpg-controller-manager --timeout=5m
k -n rabbitmq-system rollout status deployment/rabbitmq-cluster-operator --timeout=5m
k -n keda rollout status deployment/keda-operator --timeout=5m
k -n traefik rollout status deployment/traefik --timeout=5m

step "Credentials in namespace $NS"
k create namespace "$NS" --dry-run=client -o yaml | k apply -f - > /dev/null
for db in "${DATABASES[@]}"; do
  if ! has_secret "${db}-db-credentials"; then
    k -n "$NS" create secret generic "${db}-db-credentials" --type=kubernetes.io/basic-auth \
      --from-literal=username=zipframes \
      --from-literal=password="$(openssl rand -hex 16)" > /dev/null
    echo "created ${db}-db-credentials"
  fi
done
if ! has_secret seaweedfs-s3; then
  s3_secret="$(openssl rand -hex 20)"
  s3_json='{"identities":[{"name":"zipframes","credentials":[{"accessKey":"zipframes","secretKey":"'"$s3_secret"'"}],"actions":["Admin","Read","Write","List","Tagging"]}]}'
  k -n "$NS" create secret generic seaweedfs-s3 \
    --from-literal=accessKey=zipframes \
    --from-literal=secretKey="$s3_secret" \
    --from-literal=s3.json="$s3_json" > /dev/null
  echo "created seaweedfs-s3"
fi
if ! has_secret auth-jwt; then
  k -n "$NS" create secret generic auth-jwt \
    --from-literal=private.pem="$(openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 2> /dev/null)" > /dev/null
  echo "created auth-jwt"
fi

if [ "$LOAD_IMAGES" = 1 ]; then
  step "Images built here and loaded into kind"
  : "${NODE_AUTH_TOKEN:?NODE_AUTH_TOKEN is needed to install @zipframes packages}"
  (cd "$ROOT/services/processor-worker" && pnpm build && pnpm stage-runtime)
  docker compose -f "$ROOT/infra/docker-compose/docker-compose.yml" --profile apps build \
    "${SERVICES[@]}"
  for svc in "${SERVICES[@]}"; do
    docker tag "zipframes-${svc}" "ghcr.io/knzt/zipframes-${svc}:main"
    kind load docker-image --name "$CLUSTER" "ghcr.io/knzt/zipframes-${svc}:main"
  done
fi

# The loaded images exist only on the node as :main; the manifests pin a
# GHCR tag that may not be there, so point at :main and never pull.
render() {
  if [ "$LOAD_IMAGES" = 1 ]; then
    k kustomize "$1" | sed -E \
      -e 's#(image: ghcr\.io/knzt/zipframes-[a-z-]+):[^[:space:]]+#\1:main#' \
      -e 's/imagePullPolicy: (Always|IfNotPresent)/imagePullPolicy: Never/'
  else
    k kustomize "$1"
  fi
}

if [ "$MODE" = argocd ]; then
  step "Argo CD"
  : "${GITHUB_TOKEN:?export GITHUB_TOKEN with read access to $REPO_URL}"
  k create namespace argocd --dry-run=client -o yaml | k apply -f - > /dev/null
  k -n argocd apply --server-side --force-conflicts -f "$ARGOCD_URL" > /dev/null
  k -n argocd rollout status deployment/argocd-repo-server --timeout=5m
  k -n argocd rollout status deployment/argocd-applicationset-controller --timeout=5m
  k -n argocd create secret generic zipframes-repo \
    --from-literal=type=git \
    --from-literal=url="$REPO_URL" \
    --from-literal=username=git \
    --from-literal=password="$GITHUB_TOKEN" \
    --dry-run=client -o yaml |
    k label --local -f - argocd.argoproj.io/secret-type=repository -o yaml |
    k apply -f - > /dev/null
  k apply -f "$ROOT/infra/argocd/root.yaml" > /dev/null
else
  step "Platform from this working tree"
  render "$ROOT/infra/k8s/platform" | k apply -f - > /dev/null
fi

step "Waiting for Postgres and RabbitMQ"
wait_for "the CNPG clusters to be created" 60 k -n "$NS" get cluster.postgresql.cnpg.io auth-db video-db notification-db
k -n "$NS" wait cluster.postgresql.cnpg.io --all --for=condition=Ready --timeout=10m
wait_for "rabbitmq-default-user" 120 k -n "$NS" get secret rabbitmq-default-user
k -n "$NS" wait rabbitmqcluster/rabbitmq --for=condition=AllReplicasReady --timeout=10m

step "Service secrets"
amqp_url="amqp://$(secret_value rabbitmq-default-user username):$(secret_value rabbitmq-default-user password)@rabbitmq.${NS}.svc.cluster.local:5672"
db_url() {
  echo "postgresql://zipframes:$(secret_value "$1-db-credentials" password)@$1-db-rw.${NS}.svc.cluster.local:5432/$1_db"
}
s3_access="$(secret_value seaweedfs-s3 accessKey)"
s3_secret="$(secret_value seaweedfs-s3 secretKey)"

apply_secret auth-service \
  --from-literal=AUTH_DATABASE_URL="$(db_url auth)" \
  --from-literal=AMQP_URL="$amqp_url" \
  --from-literal=JWT_PRIVATE_KEY_PEM="$(secret_value auth-jwt 'private\.pem')"
apply_secret video-service \
  --from-literal=VIDEO_DATABASE_URL="$(db_url video)" \
  --from-literal=AMQP_URL="$amqp_url" \
  --from-literal=S3_ACCESS_KEY="$s3_access" \
  --from-literal=S3_SECRET_KEY="$s3_secret"
apply_secret processor-worker \
  --from-literal=AMQP_URL="$amqp_url" \
  --from-literal=S3_ACCESS_KEY="$s3_access" \
  --from-literal=S3_SECRET_KEY="$s3_secret"
apply_secret notifier-service \
  --from-literal=NOTIFICATION_DATABASE_URL="$(db_url notification)" \
  --from-literal=AMQP_URL="$amqp_url" \
  --from-literal=SMTP_URL="smtp://mailpit.${NS}.svc.cluster.local:1025" \
  --from-literal=S3_ACCESS_KEY="$s3_access" \
  --from-literal=S3_SECRET_KEY="$s3_secret"
echo "auth-service, video-service, processor-worker and notifier-service applied"

if [ "$MODE" = local ]; then
  step "Services from this working tree"
  for svc in "${SERVICES[@]}"; do
    render "$ROOT/infra/k8s/$svc" | k apply -f - > /dev/null
  done
fi

step "Starting the services"
wait_for "the service Deployments" 60 k -n "$NS" get "${SERVICES[@]/#/deployment/}"
# Pods that started before their Secret existed are stuck; restart them.
k -n "$NS" rollout restart "${SERVICES[@]/#/deployment/}" > /dev/null
for svc in "${SERVICES[@]}"; do
  k -n "$NS" rollout status "deployment/$svc" --timeout=5m
done

cat << EOF

ZipFrames is up.
  auth      http://auth.zipframes.localhost
  videos    http://api.zipframes.localhost
  storage   http://storage.zipframes.localhost
  e-mail    http://mail.zipframes.localhost
  rabbitmq  http://rabbitmq.zipframes.localhost  (user: kubectl -n $NS get secret rabbitmq-default-user)
EOF
if [ "$MODE" = argocd ]; then
  cat << EOF
  argo cd   kubectl -n argocd port-forward svc/argocd-server 8080:443, then https://localhost:8080
            admin / \$(kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath='{.data.password}' | base64 -d)
EOF
fi
