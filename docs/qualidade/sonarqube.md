# SonarQube Cloud

Quatro projetos, um por serviço. A análise roda dentro do `service-ci.yml`, no mesmo job que já executa os testes com cobertura, e usa o `lcov.info` que o vitest acabou de escrever.

## O que o plano gratuito exige

Não há limite de linhas nesse tier, mas também não existe o recurso de _monorepo_ — é por isso que os quatro projetos são criados à mão, um a um, em vez de configurados como subprojetos.

## Passo a passo

1. **Entrar com a conta do GitHub** em [sonarcloud.io](https://sonarcloud.io) e importar a organização `knzt`. Escolha o plano _Free_.

2. **Criar os quatro projetos.** Em _Analyze new project_, selecione o repositório `zipframes` quatro vezes — uma para cada serviço. Em cada um, abra _Project Settings › Update Key_ e ajuste a chave para:

   | Serviço          | Project key                       |
   | ---------------- | --------------------------------- |
   | auth-service     | `knzt_zipframes-auth-service`     |
   | video-service    | `knzt_zipframes-video-service`    |
   | notifier-service | `knzt_zipframes-notifier-service` |
   | processor-worker | `knzt_zipframes-processor-worker` |

   Essas chaves e a organização estão fixadas nos `services/<serviço>/sonar-project.properties`. Se você usar outras, mude lá também — chave divergente faz a análise falhar com `Project not found`.

3. **Desligar a análise automática** em cada projeto: _Administration › Analysis Method_, desmarque **Automatic Analysis**. Ela é ligada por padrão e é incompatível com a análise via CI; enquanto estiver ativa, o scanner do workflow é rejeitado. É também a razão de fazer isso: só a análise via CI recebe o relatório de cobertura.

4. **Gerar um token** no avatar do canto superior direito › _My Account_ › aba _Security_. O campo _Generate Tokens_ oferece três tipos; escolha **Global Analysis Token**:

   | Tipo                      | Alcance                                               |
   | ------------------------- | ----------------------------------------------------- |
   | **Global Analysis Token** | Analisa qualquer projeto da organização, e só isso    |
   | User Token                | Tudo o que a sua conta pode fazer, não só analisar    |
   | Project Analysis Token    | Um único projeto — exigiria quatro secrets diferentes |

   Os quatro workflows assumem um token que vale para os quatro projetos, e o Global Analysis Token é o mais restrito que atende a isso: se vazar, serve só para enviar análises. Dê um nome (`zipframes-ci`, por exemplo) e um prazo de expiração. **O valor aparece uma única vez** — se fechar a página sem copiar, gere outro.

5. **Guardar o token no GitHub** como `SONAR_TOKEN`. Os jobs rodam no environment `Actions` (é de lá que sai o `NODE_AUTH_TOKEN`), então cadastre em _Settings › Environments › Actions › Environment secrets_ — um secret de repositório não é visto por um job com `environment:`.

6. **Abrir um PR.** Cada workflow de serviço roda o scanner e publica a análise; o SonarQube Cloud comenta o resultado no PR.

## Como está ligado ao CI

- `service-ci.yml` ganhou o input `sonar`. Quando ligado, o `checkout` passa a usar `fetch-depth: 0` (o Sonar lê o histórico para atribuir o _new code_) e um passo roda `SonarSource/sonarqube-scan-action` com `projectBaseDir` no diretório do serviço.
- O scanner só roda depois dos testes, e depende de `coverage: true`. O `processor-worker`, que rodava sem cobertura, passou a rodar com.
- Os quatro `vitest.unit.config.ts` agora escrevem `reporter: ['text', 'lcov']`. O `coverage/` continua fora do git.

## Cobertura: por que existe `sonar.coverage.exclusions`

Os configs do vitest medem uma fatia deliberada do `src/`: domínio, casos de uso, controllers e os adaptadores que têm teste unitário. O que fica fora do `include` simplesmente não aparece no `lcov` — e, para o Sonar, arquivo sem linha coberta é arquivo com 0%.

Sem exclusão, o `main/` e os drivers (Prisma, conexão AMQP) puxariam o número para baixo e, pior, derrubariam o quality gate assim que alguém encostasse neles, já que o gate padrão cobra 80% **sobre o código novo**. Por isso cada `sonar-project.properties` espelha o `include`/`exclude` do vitest daquele serviço.

## Quality gate

O gate padrão (_Sonar way_) só avalia código novo: sem issues abertas, sem hotspots de segurança não revisados, 80% de cobertura e no máximo 3% de duplicação. É um bom ponto de partida e não bloqueia o histórico existente. Se quiser que o gate reprove o merge, marque a checagem do Sonar como obrigatória em _Settings › Branches_ no GitHub.
