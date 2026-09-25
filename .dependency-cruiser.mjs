/** @type {import("dependency-cruiser").IConfiguration} */
export default {
  // Clean Architecture is the base (dependencies point inward), not a
  // one-to-one copy of the four book layers. application/ holds use cases
  // and interface adapters together.
  // Folder layout: infrastructure → application → domain (+ main as composition root)
  forbidden: [
    {
      name: 'domain-não-importa-nada-externo',
      comment: 'Entities não podem importar application, infrastructure ou main.',
      severity: 'error',
      from: { path: '/src/domain/' },
      to: {
        path: ['/src/application/', '/src/infrastructure/', '/src/main/'],
      },
    },
    {
      name: 'domain-não-importa-node',
      comment:
        'O domínio não importa módulos nativos (fs, crypto, child_process). ' +
        'Esses detalhes ficam em infrastructure/.',
      severity: 'error',
      from: { path: '/src/domain/' },
      to: { dependencyTypes: ['core'] },
    },
    {
      name: 'domain-não-importa-infra',
      comment:
        'O domínio só pode depender de @zipframes/core, @zipframes/value-objects e de @types. ' +
        'Qualquer outro pacote npm é infraestrutura.',
      severity: 'error',
      from: { path: '/src/domain/' },
      to: {
        dependencyTypes: ['npm'],
        // Os padrões abaixo são comparados com o caminho RESOLVIDO do
        // módulo, não com o nome do import: um `@zipframes/core` vira
        // `node_modules/@zipframes/core/dist/index.js` (e, no pnpm, algo
        // sob `.pnpm/` terminando no mesmo trecho). Escrever `^@zipframes/…`
        // aqui não casaria com nada, e a exceção seria silenciosamente
        // inútil.
        pathNot: [
          // No domínio só entram tipos e os pacotes de domínio publicados:
          // value objects genéricos e utilitários sem infraestrutura.
          'node_modules/@types/',
          'node_modules/@zipframes/(value-objects|core)/',
        ],
      },
    },

    {
      name: 'application-não-importa-infrastructure',
      comment:
        'application/ (casos de uso e interface adapters) só pode importar domain/ e as interfaces definidas lá ou na própria application/. ' +
        'Implementações ficam em infrastructure/ e são injetadas pelo main/.',
      severity: 'error',
      from: { path: '/src/application/' },
      to: {
        path: ['/src/infrastructure/', '/src/main/'],
      },
    },
    {
      name: 'application-não-importa-libs-de-infra',
      comment:
        'application/ só importa pacotes de contrato (@zipframes/core, schemas, value-objects) ' +
        'e zod, que o controller usa no tipo da resposta. Prisma, amqplib, Fastify, bcrypt, jose ' +
        'e o restante ficam em infrastructure/. Uma lista de proibições deixava bcrypt e jose passarem.',
      severity: 'error',
      from: { path: '/src/application/' },
      to: {
        dependencyTypes: ['npm'],
        pathNot: [
          'node_modules/@zipframes/(core|schemas|value-objects)/',
          'node_modules/zod/',
          'node_modules/@types/',
        ],
      },
    },

    {
      name: 'infrastructure-não-importa-main',
      severity: 'error',
      from: { path: '/src/infrastructure/' },
      to: { path: '/src/main/' },
    },

    {
      name: 'serviços-não-importam-outros-serviços',
      comment:
        'Serviços em services/ não podem importar código de outros serviços. ' +
        'Código compartilhado vem dos pacotes @zipframes/*.',
      severity: 'error',
      from: { path: '^services/([^/]+)/' },
      to: {
        path: '^services/',
        pathNot: ['^services/$1/', 'node_modules'],
      },
    },
    {
      name: 'sem-ciclos',
      comment: 'Dependências cíclicas tornam o código imprevisível e difícil de testar.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'sem-vitest-em-produção',
      comment: 'Vitest só pode ser importado em arquivos de teste.',
      severity: 'error',
      from: { pathNot: '\\.(test|spec)\\.ts$' },
      to: { path: 'node_modules/(@vitest/|vitest/)' },
    },
  ],

  options: {
    // Não percorrer o interior de node_modules, mas mantê-lo visível: as
    // dependências npm precisam aparecer no grafo para que as regras que
    // proíbem infraestrutura em domain/ e application/ tenham o que
    // verificar. Excluí-las, como era feito antes, tornava essas regras
    // inertes — elas existiam e nunca podiam disparar.
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      // Ancorado no nosso próprio build: um 'dist' solto casaria também com
      // node_modules/<pacote>/dist/…, que é onde a maioria dos pacotes
      // publica o entrypoint — inclusive os @zipframes/*. O efeito seria
      // remover essas dependências do grafo e tornar inertes as regras que
      // falam sobre elas.
      path: [
        '\\.d\\.ts$',
        '^(services|packages)/[^/]+/dist/',
        '^(services|packages)/[^/]+/coverage/',
        '\\.test\\.ts$',
        '\\.spec\\.ts$',
      ],
    },
    moduleSystems: ['cjs', 'es6'],
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
  },
};
