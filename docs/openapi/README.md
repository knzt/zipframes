# OpenAPI

Contrato das APIs HTTP, um arquivo por serviço, na convenção já usada para os
eventos (`@zipframes/schemas`): cada serviço é dono do seu próprio contrato.

| Arquivo                                    | Serviço                                     |
| ------------------------------------------ | ------------------------------------------- |
| [`auth-service.yaml`](auth-service.yaml)   | Cadastro, login e JWKS                      |
| [`video-service.yaml`](video-service.yaml) | Vídeos: upload, status, download e exclusão |

O resumo em prosa das rotas está em [`docs/domain/dominio.md`](../domain/dominio.md);
estes arquivos são o contrato completo, com schemas de request e response.

## Visualizar

```bash
npx @redocly/cli preview-docs docs/openapi/video-service.yaml
```

## Validar

```bash
npx @redocly/cli lint docs/openapi/*.yaml
```

## Convenções

- **OpenAPI 3.1**, que usa JSON Schema 2020-12 (`type: [string, "null"]` em vez
  de `nullable: true`).
- **Erros no formato Problem Details** (RFC 9457), o mesmo `ProblemDetails`
  descrito em cada arquivo.
- **Um vídeo de outro usuário responde 404, nunca 403** — a regra está
  documentada em cada rota que se aplica, não só no domínio.
- Os endpoints `/health/live`, `/health/ready` e `/metrics` estão descritos
  para completude, mas são acessíveis apenas dentro do cluster.
