## O que este PR faz

<!-- Descreva o que foi feito e por quê. -->

## Checklist (Definition of Done)

- [ ] O CI está verde (lint, typecheck, testes, cobertura ≥ 80% em `domain/` e `application/`)
- [ ] Nenhuma violação de camadas (`dependency-cruiser` passando)
- [ ] Testes unitários cobrem os casos relevantes (incluindo caminhos de erro)
- [ ] Sem `any` ou supressões de lint sem justificativa no comentário
- [ ] `OpenAPI`, `AsyncAPI` ou ADR atualizados se a mudança afeta contratos ou decisões de arquitetura
- [ ] `.env.example` atualizado se novas variáveis de ambiente foram adicionadas
- [ ] `README` do serviço atualizado se o comportamento externo mudou

## Tipo de mudança

- [ ] `feat` — nova funcionalidade
- [ ] `fix` — correção de bug
- [ ] `chore` — build, dependências, configuração
- [ ] `docs` — documentação
- [ ] `test` — testes
- [ ] `ci` — pipeline
- [ ] `refactor` — sem mudança de comportamento externo
