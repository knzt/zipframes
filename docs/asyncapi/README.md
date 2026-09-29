# AsyncAPI

Contrato dos eventos de integração publicados no exchange `zipframes.events`,
com um envelope comum e um schema de payload por evento. É o Published
Language entre os bounded contexts, descrito em prosa em
[`docs/domain/dominio.md`](../domain/dominio.md#eventos-de-integração).

## Visualizar

```bash
npx @asyncapi/cli generate fromTemplate docs/asyncapi/events.yaml @asyncapi/html-template -o /tmp/asyncapi-docs
```

## Validar

```bash
npx @asyncapi/cli validate docs/asyncapi/events.yaml
```

## Convenções

- **AsyncAPI 3.0.** Uma versão de contrato só muda quando o payload muda de
  forma incompatível; um campo novo opcional mantém a versão (ver
  `docs/domain/dominio.md`).
- **O nome do canal é a routing key** no RabbitMQ (`video.uploaded`, por
  exemplo), e cada mensagem carrega o envelope completo, nunca só o payload.
- Os schemas aqui devem espelhar exatamente os de `@zipframes/schemas`, que é
  quem os implementa em código. Uma mudança em um lado sem o outro é uma
  divergência a corrigir, não uma opção.
