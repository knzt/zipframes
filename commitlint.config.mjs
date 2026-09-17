/** @type {import("@commitlint/types").UserConfig} */
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    // Tipos permitidos no projeto
    "type-enum": [
      2,
      "always",
      [
        "feat",    // nova funcionalidade
        "fix",     // correção de bug
        "docs",    // documentação
        "style",   // formatação (sem mudança de lógica)
        "refactor",// refatoração sem feat nem fix
        "test",    // testes
        "chore",   // build, ci, dependências
        "ci",      // mudanças no pipeline
        "perf",    // melhoria de performance
        "revert",  // reverter commit
      ],
    ],
    "subject-case": [2, "always", "lower-case"],
    "header-max-length": [2, "always", 100],
    "body-max-line-length": [2, "always", 120],
  },
};
