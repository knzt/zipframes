/** @type {import("dependency-cruiser").IConfiguration} */
export default {
  // Clean Architecture (Uncle Bob):
  // Frameworks & Drivers / Interface Adapters → Use Cases → Entities
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
      name: 'domain-não-importa-infra',
      comment: 'O domínio não pode depender de bibliotecas de infraestrutura.',
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
        'Use Cases só podem importar domain/ e as interfaces definidas lá ou na própria application/. ' +
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
        'Use Cases não podem importar Prisma, amqplib, ioredis, @aws-sdk, nodemailer, fastify… ' +
        'A interface fica em application/ports/; a implementação fica em infrastructure/.',
      severity: 'error',
      from: { path: '/src/application/' },
      to: {
        dependencyTypes: ['npm'],
        // Como acima, comparado com o caminho resolvido. O `node_modules/`
        // no início ancora o padrão no nome do pacote e evita casar com um
        // arquivo do próprio serviço que por acaso se chame `prisma.ts`.
        path: [
          'node_modules/(@prisma/|prisma/)',
          'node_modules/amqplib/',
          'node_modules/ioredis/',
          'node_modules/@aws-sdk/',
          'node_modules/nodemailer/',
          'node_modules/(@fastify/|fastify/)',
          'node_modules/pino/',
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
