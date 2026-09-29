# Dados de demonstração

Os seeds preenchem os três bancos locais com um conjunto único e coerente: o mesmo usuário aparece em `auth-db`, é dono dos vídeos em `video-db` e é o contato das notificações em `notification-db`. Isso permite subir o ambiente e navegar o fluxo inteiro sem cadastrar nada na mão.

Como nenhum serviço pode importar código de outro, cada seed repete os UUIDs abaixo. **Esta página é a fonte da verdade: ao mudar um identificador aqui, mude nos três arquivos.**

## Como rodar

```bash
pnpm infra:up                       # sobe os bancos
pnpm --dir services/auth-service db:migrate
pnpm --dir services/video-service db:migrate
pnpm --dir services/notifier-service db:migrate
pnpm db:seed                        # popula os três
```

Cada serviço também tem o seu: `pnpm --dir services/video-service db:seed`. O script lê o `.env` do serviço, então copie o `.env.example` antes. Todos os seeds são idempotentes — rodar duas vezes não duplica nem altera nada.

Para zerar e recomeçar: `pnpm infra:reset`, seguido das migrations e do seed.

## Usuários (`auth-db`)

Senha dos dois: `zipframes123`.

| UUID                                   | Nome               | E-mail                  |
| -------------------------------------- | ------------------ | ----------------------- |
| `11111111-1111-4111-8111-111111111111` | Ana Demonstração   | `ana@zipframes.local`   |
| `22222222-2222-4222-8222-222222222222` | Bruno Demonstração | `bruno@zipframes.local` |

## Vídeos (`video-db`)

Ana tem um vídeo em cada status, de modo que a listagem filtrada por status tenha resultado em todos os ramos. O vídeo do Bruno existe para tornar visível o recorte por dono: ele nunca pode aparecer sob o token da Ana.

| UUID                                   | Dono  | Arquivo                       | Status       |
| -------------------------------------- | ----- | ----------------------------- | ------------ |
| `a0000000-0000-4000-8000-000000000001` | Ana   | `apresentacao-fiap.mp4`       | `QUEUED`     |
| `a0000000-0000-4000-8000-000000000002` | Ana   | `demo-produto.mp4`            | `PROCESSING` |
| `a0000000-0000-4000-8000-000000000003` | Ana   | `aula-clean-architecture.mp4` | `DONE`       |
| `a0000000-0000-4000-8000-000000000004` | Ana   | `gravacao-corrompida.mp4`     | `FAILED`     |
| `a0000000-0000-4000-8000-000000000005` | Ana   | `retrospectiva-sprint-8.mp4`  | `EXPIRED`    |
| `a0000000-0000-4000-8000-000000000006` | Ana   | `teste-descartado.mp4`        | `DELETED`    |
| `b0000000-0000-4000-8000-000000000001` | Bruno | `onboarding-bruno.mp4`        | `DONE`       |

O seed grava linhas, não objetos: nenhum arquivo é enviado ao bucket. Um vídeo `DONE` é listável e os metadados estão corretos, mas o download pré-assinado responde 404 até o worker de fato produzir o pacote. Para exercitar o download, faça um upload de verdade.

## Notificações (`notification-db`)

| Vídeo        | Tipo              | Status    | O que demonstra                                        |
| ------------ | ----------------- | --------- | ------------------------------------------------------ |
| Ana `DONE`   | `VIDEO_PROCESSED` | `SENT`    | Entrega concluída, com `sent_at` e destinatário        |
| Ana `FAILED` | `VIDEO_FAILED`    | `FAILED`  | Três tentativas registradas em `notification_attempts` |
| Bruno `DONE` | `VIDEO_PROCESSED` | `PENDING` | Linha na fila que o drain local tem para processar     |

Os contatos das duas pessoas são gravados, como se a projeção já tivesse consumido os eventos `user.registered`.
