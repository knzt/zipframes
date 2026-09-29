# C4 nível 3: componentes do auth-service

O auth-service por dentro: o cadastro, o login e a publicação da chave pública. Os nomes nas caixas são os nomes das classes no código. As decisões por trás deste desenho estão em [auth-service.md](../services/auth-service.md).

```mermaid
flowchart TB
  ingress["<b>Ingress</b>"]
  videosvc["<b>video-service</b>"]

  subgraph as["auth-service [Container]"]
    direction TB

    subgraph fwin["Frameworks & Drivers: entrada"]
      direction LR
      fastify["Servidor Fastify<br/>+ catálogo de rotas"]
      jwks["Rota JWKS"]
    end

    subgraph adin["Interface Adapters"]
      direction LR
      ctrl["RegisterUser, Login,<br/>DeleteAccount<br/><i>Controllers</i>"]
    end

    subgraph app["Use Cases"]
      direction LR
      uc["RegisterUser<br/>Login<br/>DeleteAccount"]
      interfaces["<b>Interfaces</b><br/>UserRepository<br/>EventPublisher<br/>PasswordHasher<br/>TokenIssuer"]
    end

    subgraph dom["Entities"]
      direction LR
      user["User"]
      vos["Password, UserRegistered"]
    end

    subgraph fwout["Frameworks & Drivers: saída"]
      direction LR
      repo["PrismaUserRepository"]
      events["AmqpEventPublisherGateway"]
      hasher["BcryptPasswordHasher"]
      issuer["Rs256TokenIssuer"]
      selfauth["Authenticator<br/>(própria chave pública)"]
    end
  end

  db[("<b>auth-db</b>")]
  broker[["<b>RabbitMQ</b><br/>zipframes.events"]]

  ingress -- "POST /register<br/>POST /login<br/>DELETE /account" --> fastify
  videosvc -- "GET /.well-known/jwks.json" --> jwks
  fastify --> ctrl
  ctrl --> uc
  uc --> user
  user --- vos
  uc --> interfaces
  interfaces -. "implementadas por" .-> fwout
  jwks -. "chave pública" .-> issuer
  issuer -. "chave pública" .-> selfauth
  selfauth -. "verifica o Bearer de<br/>DELETE /account" .-> ctrl
  repo --> db
  events --> broker

  classDef ext fill:#8a8a8a,stroke:#5e5e5e,color:#ffffff
  classDef fwc fill:#dbe7f5,stroke:#5f86b8,color:#1b2a3a
  classDef adc fill:#cfe8dc,stroke:#4e9373,color:#15291f
  classDef appc fill:#f7e3c4,stroke:#c28a2e,color:#2e2210
  classDef domc fill:#f3d0d0,stroke:#b35c5c,color:#2e1515
  class ingress,videosvc,db,broker ext
  class fastify,jwks,repo,events,hasher,issuer,selfauth fwc
  class ctrl adc
  class uc,interfaces appc
  class user,vos domc
```

A rota JWKS não tem controller nem caso de uso: ela só publica a parte pública da chave que o `Rs256TokenIssuer` usa para assinar. Quem valida o token é cada serviço que o recebe, com essa chave — inclusive o próprio auth-service: `DELETE /account` exige um Bearer válido, e como o processo já tem a própria chave pública em memória, ele verifica localmente em vez de chamar a própria rota JWKS pela rede.

## Componentes

| Camada               | Componente                   | Responsabilidade                                                                                                             |
| -------------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Entities             | `User`                       | Valida nome e e-mail na criação e gera o próprio id                                                                          |
| Entities             | `Password`, `UserRegistered` | Regra de senha (mínimo de 8 caracteres e máximo de 72 bytes, o limite do bcrypt, com letra e dígito) e o fato de um cadastro |
| Use Cases            | `RegisterUser`               | Valida, recusa e-mail repetido, gera o hash, grava o usuário e publica `user.registered`                                     |
| Use Cases            | `Login`                      | Confere e-mail e senha e emite o token; qualquer falha é a mesma resposta 401                                                |
| Use Cases            | `DeleteAccount`              | Apaga o usuário e publica `user.deleted`; um id que já não existe não é erro                                                 |
| Interface Adapters   | `RegisterUser`, `Login`      | `defineHandler`: validam o corpo, chamam o caso de uso e traduzem o `Result` em resposta HTTP                                |
| Interface Adapters   | `DeleteAccount`              | `defineAuthenticatedHandler`: verifica o Bearer, chama o caso de uso com o `sub` do token e responde 204                     |
| Frameworks & Drivers | `PrismaUserRepository`       | Insere, busca e apaga usuários na tabela `users`                                                                             |
| Frameworks & Drivers | `AmqpEventPublisherGateway`  | Monta o envelope e publica no exchange `zipframes.events` com confirmação do broker                                          |
| Frameworks & Drivers | `BcryptPasswordHasher`       | Hash e comparação de senha                                                                                                   |
| Frameworks & Drivers | `Rs256TokenIssuer`           | Assina o JWT com a chave privada RSA e expõe a chave pública para o JWKS                                                     |
| Frameworks & Drivers | `Authenticator`              | Verifica o Bearer de `DELETE /account` contra a própria chave pública, sem round-trip HTTP                                   |
