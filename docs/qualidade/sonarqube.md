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

## Quality gate

O _Sonar way_ avalia só código novo: sem issues abertas, sem hotspots de segurança não revisados, 80% de cobertura e no máximo 3% de duplicação.
