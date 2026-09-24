## O que este PR faz

<!-- Descreva o que foi feito e por quê. -->

## Checklist (Definition of Done)

- [ ] O CI está ok (lint, typecheck, testes, cobertura ≥ 80% em `domain/` e `application/`)
- [ ] Nenhuma violação de arquitetura
- [ ] Testes unitários cobrem os casos relevantes (incluindo caminhos de erro)
- [ ] Sem `any` ou supressões de lint
- [ ] Schemas das rotas atualizadas se a mudança afeta o HTTP (o OpenAPI é gerado; não editar um YAML à mão)
- [ ] `.env.example` atualizado se novas variáveis de ambiente foram adicionadas
- [ ] `README` do serviço atualizado se o comportamento externo mudou
