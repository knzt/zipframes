# SonarQube Cloud

Quatro projetos, um por serviço. O plano gratuito não tem o recurso de _monorepo_, então cada projeto é criado separadamente.

| Serviço          | Project key                       |
| ---------------- | --------------------------------- |
| auth-service     | `knzt_zipframes-auth-service`     |
| video-service    | `knzt_zipframes-video-service`    |
| notifier-service | `knzt_zipframes-notifier-service` |
| processor-worker | `knzt_zipframes-processor-worker` |

As chaves e a organização estão fixadas em `services/<serviço>/sonar-project.properties`. Chave divergente faz a análise falhar com `Project not found`.

## Como roda

O input `sonar` do `service-ci.yml` liga a análise: o `checkout` passa a usar `fetch-depth: 0`, porque o Sonar lê o histórico para atribuir o _new code_, e o `sonarqube-scan-action` roda depois dos testes, com `projectBaseDir` no diretório do serviço. Os `vitest.unit.config.ts` escrevem `reporter: ['text', 'lcov']`, e é esse `lcov.info` que o scanner envia.

O token vai no secret `SONAR_TOKEN` do environment `Actions` — um secret de repositório não é visto por um job com `environment:`. Um _Global Analysis Token_ cobre os quatro projetos e não faz nada além de enviar análise.

Cada projeto precisa da **Automatic Analysis desligada** (_Administration › Analysis Method_): ela é ligada por padrão, é incompatível com a análise via CI e não recebe relatório de cobertura.

## Por que existe `sonar.coverage.exclusions`

Os configs do vitest medem uma fatia deliberada do `src/`: domínio, casos de uso, controllers e os adaptadores com teste unitário. O que fica fora do `include` não aparece no `lcov`, e para o Sonar arquivo sem linha coberta é arquivo com 0%.

Sem exclusão, o `main/` e os drivers derrubariam o quality gate assim que alguém encostasse neles, já que o gate cobra 80% sobre o código novo. Por isso cada `sonar-project.properties` espelha o `include`/`exclude` do vitest daquele serviço — **as duas listas mudam juntas.**

## Quality gate

O _Sonar way_ avalia só código novo: sem issues abertas, sem hotspots de segurança não revisados, 80% de cobertura e no máximo 3% de duplicação. Para reprovar o merge, marque a checagem do Sonar como obrigatória em _Settings › Branches_.
