# C4 nível 1: contexto

Mostra o sistema como uma caixa única, quem o usa e com quais sistemas externos ele se relaciona.

```mermaid
flowchart TB
  user["<b>Usuário</b><br/><i>[Pessoa]</i><br/>Envia vídeos e baixa<br/>os frames extraídos"]
  system["<b>ZipFrames</b><br/><i>[Sistema de software]</i><br/>Recebe vídeos, extrai um frame por segundo<br/>e entrega os frames em um arquivo zip"]
  smtp["<b>Servidor de e-mail</b><br/><i>[Sistema externo]</i><br/>Entrega as notificações de falha<br/>(Mailpit no ambiente local)"]

  user -- "Cadastra-se, envia vídeos,<br/>acompanha o status e baixa os zips<br/>[HTTPS]" --> system
  system -- "Envia notificações de falha<br/>[SMTP]" --> smtp
  smtp -- "Entrega o e-mail" --> user

  classDef person fill:#08427b,stroke:#052e56,color:#ffffff
  classDef internal fill:#1168bd,stroke:#0b4884,color:#ffffff
  classDef external fill:#8a8a8a,stroke:#5e5e5e,color:#ffffff
  class user person
  class system internal
  class smtp external
```

## Elementos

| Elemento | Tipo | Descrição |
|---|---|---|
| Usuário | Pessoa | Qualquer pessoa cadastrada. Não há perfis diferentes na primeira versão |
| ZipFrames | Sistema interno | O sistema construído para a FIAP X, objeto desta documentação |
| Servidor de e-mail | Sistema externo | Qualquer servidor SMTP. No ambiente local, o Mailpit captura as mensagens e as exibe em uma interface web |

## Legenda

| Cor | Significado |
|---|---|
| Azul escuro | Pessoa |
| Azul | Sistema construído neste projeto |
| Cinza | Sistema externo |
