# notifier-service

O notifier-service avisa o usuário por e-mail quando o zip de um vídeo fica pronto e quando o processamento falha. Para isso ele mantém uma cópia própria dos contatos, alimentada pelos eventos de identidade, e não consulta o auth-service.

Os componentes e como eles se ligam estão no [C4 nível 3](../c4/03-componentes-notifier-service.md). A organização de pastas, comum aos quatro serviços, está na [visão geral da arquitetura](../README.md#organização-de-cada-serviço).

## Dois trabalhos, duas filas

| Fila                | Eventos                                           | O que faz                                   |
| ------------------- | ------------------------------------------------- | ------------------------------------------- |
| `notifier.contacts` | `user.registered`, `user.updated`, `user.deleted` | Grava, atualiza ou apaga a cópia do contato |
| `notifier.emails`   | `video.processed`, `video.failed`                 | Cria a notificação e envia o e-mail         |

As filas são separadas para um problema no SMTP não atrasar a atualização dos contatos. Cada uma tem a própria fila de retry, que devolve a mensagem direto para ela. Um evento que chega na fila errada vai para a DLQ.

## Os e-mails

| Tipo              | Conteúdo                                                                                                            |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| `VIDEO_PROCESSED` | Nome do arquivo, número de frames e o link para baixar o zip, válido por 24 horas, mais um link de reserva pela API |
| `VIDEO_FAILED`    | Nome do arquivo, data do envio e o link para enviar de novo. O motivo técnico da falha não vai para o usuário       |

O link de download é uma URL assinada do storage, calculada pelo próprio serviço com o endpoint público. O zip não vai anexado: um vídeo longo gera um arquivo grande demais para e-mail.

## Garantias

Existe no máximo uma notificação por vídeo e tipo (restrição única no banco). Uma mensagem entregue de novo encontra a notificação já `SENT` ou `FAILED` e não faz nada, então o usuário não recebe o mesmo e-mail duas vezes.

Se o evento do vídeo chega antes do contato (o `user.registered` se atrasou ou se perdeu), a notificação fica `PENDING`. Quando o contato chega, o serviço envia tudo o que estava esperando por ele.

Uma falha de SMTP é registrada em `notification_attempts` e a mensagem volta para a fila de retry. Na terceira falha, a notificação vira `FAILED` e a mensagem é confirmada.

`user.deleted` apaga o contato e o histórico de notificações daquele usuário.

## Operação

| Item      | Valor                                                                                  |
| --------- | -------------------------------------------------------------------------------------- |
| Banco     | `notification-db` (Postgres): `contacts`, `notifications`, `notification_attempts`     |
| Consome   | `user.registered`, `user.updated`, `user.deleted`, `video.processed`, `video.failed`   |
| Envia     | SMTP (Mailpit no ambiente local, em http://mail.zipframes.localhost no kind)           |
| Probes    | HTTP na porta de operação 9464: `/health/live` e `/health/ready` (Postgres e RabbitMQ) |
| Escala    | Uma réplica                                                                            |
| Manifests | [`infra/k8s/notifier-service`](../../../infra/k8s/notifier-service)                    |

## Testes

Os testes de unidade cobrem a unicidade por tipo, o `PENDING` à espera do contato, o envio pendente quando o contato chega, o limite de tentativas e o texto de cada e-mail. Os de integração rodam contra RabbitMQ, Postgres, Mailpit e SeaweedFS em containers e conferem, entre outras coisas, que um retry não chega aos outros assinantes do evento.

## Limitações

- O auth-service ainda não publica `user.updated`: não há como mudar nome ou e-mail depois do cadastro, então esse consumo nunca dispara em produção.
- Não há outro canal além de e-mail.
