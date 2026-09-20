/** @type {import("dependency-cruiser").IConfiguration} */
export default {
  // Clean Architecture (Uncle Bob):
  // Frameworks & Drivers / Interface Adapters → Use Cases → Entities
  // Folder layout: infrastructure → application → domain (+ main as composition root)
  forbidden: [
    {
      name: 'domain-não-importa-nada-externo',
      comment:
        'Entities não podem importar application, infrastructure, main ' +
        'nem o layout legado adapters/frameworks.',
      severity: 'error',
      from: { path: '/src/domain/' },
      to: {
        path: [
          '/src/application/',
          '/src/infrastructure/',
          '/src/adapters/',
          '/src/frameworks/',
          '/src/main/',
        ],
      },
    },
    {
      name: 'domain-não-importa-infra',
      comment: 'O domínio não pode depender de bibliotecas de infraestrutura.',
      severity: 'error',
      from: { path: '/src/domain/' },
      to: {
        dependencyTypes: ['npm'],
        pathNot: ['^@types/', '^@zipframes/(value-objects|core)$'],
      },
    },

    {
      name: 'application-não-importa-infrastructure',
      comment:
        'Use Cases só podem importar domain/ e interfaces de gateway. ' +
        'Implementações ficam em infrastructure/ e são injetadas pelo main/.',
      severity: 'error',
      from: { path: '/src/application/' },
      to: {
        path: ['/src/infrastructure/', '/src/adapters/', '/src/frameworks/', '/src/main/'],
      },
    },
    {
      name: 'application-não-importa-libs-de-infra',
      comment:
        'Use Cases não podem importar Prisma, amqplib, ioredis, @aws-sdk, nodemailer, fastify… ' +
        'Use gateways em src/application/gateways/.',
      severity: 'error',
      from: { path: '/src/application/' },
      to: {
        dependencyTypes: ['npm'],
        path: [
          'prisma',
          'amqplib',
          'ioredis',
          '@aws-sdk',
          'nodemailer',
          'fastify',
          '@fastify',
          'pino',
        ],
      },
    },

    {
      name: 'infrastructure-não-importa-main',
      severity: 'error',
      from: { path: '/src/infrastructure/' },
      to: { path: '/src/main/' },
    },

    // Layout legado (adapters + frameworks) — mantido enquanto algum serviço ainda o usar
    {
      name: 'adapters-não-importa-frameworks',
      comment: 'Layout legado: Interface Adapters não importam frameworks diretamente.',
      severity: 'error',
      from: { path: '/src/adapters/' },
      to: { path: '/src/frameworks/' },
    },
    {
      name: 'adapters-não-importa-main',
      severity: 'error',
      from: { path: '/src/adapters/' },
      to: { path: '/src/main/' },
    },
    {
      name: 'frameworks-não-importa-main',
      severity: 'error',
      from: { path: '/src/frameworks/' },
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
        pathNot: '^services/$1/',
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
      to: { path: '^vitest$|^@vitest/' },
    },
  ],

  options: {
    doNotFollow: {
      dependencyTypes: ['npm-dev', 'npm-peer', 'npm-optional'],
    },
    exclude: {
      path: ['node_modules', '\\.d\\.ts$', 'dist', 'coverage', '\\.test\\.ts$', '\\.spec\\.ts$'],
    },
    moduleSystems: ['cjs', 'es6'],
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    reporterOptions: {},
  },
};
