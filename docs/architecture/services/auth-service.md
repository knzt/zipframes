# auth-service

O auth-service cuida da identidade: cadastra usuários, confere e-mail e senha e emite o token que os outros serviços aceitam. Ele não sabe nada de vídeos.

Os componentes e como eles se ligam estão no [C4 nível 3](../c4/03-componentes-auth-service.md). A organização de pastas, comum aos quatro serviços, está na [visão geral da arquitetura](../README.md#organização-de-cada-serviço).

## Rotas

| Rota                         | O que faz                                             |
| ---------------------------- | ----------------------------------------------------- |
| `POST /register`             | Cadastra um usuário (201) e publica `user.registered` |
| `POST /login`                | Devolve um JWT de 15 minutos                          |
| `GET /.well-known/jwks.json` | Publica a chave pública que valida os tokens          |

Além dessas, as rotas de operação comuns aos serviços HTTP (`/health/*`, `/metrics`, `/docs`), descritas na [visão geral](../README.md#http). A porta padrão é 3000.

## Cadastro

1. O nome e o e-mail são validados pelos value objects de `@zipframes/value-objects`. O e-mail é guardado em minúsculas, então duas contas não podem diferir só pela caixa.
2. A senha precisa ter pelo menos 8 caracteres, uma letra e um dígito, e no máximo 72 bytes. Esse teto é o do bcrypt, que ignora o que passa dele; aceitar mais daria a impressão de que o resto da senha conta.
3. Um e-mail já cadastrado responde 409 (`EMAIL_TAKEN`). A checagem é feita antes do hash, para não gastar bcrypt com um pedido que vai ser recusado.
4. O usuário é gravado e o evento `user.registered` é publicado com confirmação do broker. O notifier-service usa esse evento para guardar o contato.

Se a publicação falhar depois de o usuário ser gravado, o cadastro ainda responde 201 e a falha vai para o log. Responder erro nesse ponto levaria o cliente a tentar de novo e receber `EMAIL_TAKEN` para uma conta que existe. O custo é o notifier-service não conhecer esse contato até um próximo evento de identidade; enquanto isso, os e-mails desse usuário ficam pendentes.

## Login e token

O login responde o mesmo 401 (`INVALID_CREDENTIALS`) para e-mail desconhecido, senha errada e corpo inválido, para não revelar quais e-mails têm conta.

O token é um JWT RS256 com `sub` (o id do usuário), `iss`, `aud` e validade de 15 minutos. Só o auth-service tem a chave privada. Os outros serviços validam com a chave pública do JWKS, sem chamar o auth-service a cada requisição.

No Compose, a chave de desenvolvimento está em `infra/docker-compose/auth/jwt-dev.pem`. No cluster, o bootstrap gera uma chave nova e a entrega pelo Secret `auth-service` (`JWT_PRIVATE_KEY_PEM`). Trocar a chave invalida os tokens emitidos com a anterior.

## Operação

| Item      | Valor                                                       |
| --------- | ----------------------------------------------------------- |
| Banco     | `auth-db` (Postgres), tabela `users`                        |
| Publica   | `user.registered` em `zipframes.events`                     |
| Readiness | Postgres e RabbitMQ                                         |
| Escala    | HPA por CPU, de 1 a 3 réplicas, alvo de 70%                 |
| Manifests | [`infra/k8s/auth-service`](../../../infra/k8s/auth-service) |

## Testes

Os testes de unidade cobrem domínio, casos de uso, controllers, criptografia e o gateway de eventos, com implementações falsas das interfaces. Os de integração sobem o serviço de verdade contra Postgres e RabbitMQ em containers e conferem o cadastro, o login e a mensagem publicada no broker.

## Limitações

- Não há alteração nem exclusão de conta, então `user.updated` e `user.deleted` ainda não são publicados.
- Não há refresh token. Depois de 15 minutos, o usuário faz login de novo.
