/** @type {import("dependency-cruiser").IConfiguration} */
export default {
  // Clean Architecture four rings in src/: domain, application (use cases +
  // ports), interface-adapters (controllers), infrastructure (drivers).
  // main/ is the composition root. Dependencies point inward.
  // Folder layout: main → interface-adapters / infrastructure → application → domain
  forbidden: [
    {
      name: 'domain-não-importa-nada-externo',
      comment:
        'Entities não podem importar application, interface-adapters, infrastructure ou main.',
      severity: 'error',
      from: { path: '/src/domain/' },
      to: {
        path: [
          '/src/application/',
          '/src/interface-adapters/',
          '/src/infrastructure/',
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
      name: 'application-não-importa-camadas-externas',
      comment:
        'application/ (casos de uso e ports) só pode importar domain/. ' +
        'Controllers ficam em interface-adapters/; implementações em infrastructure/, injetadas pelo main/.',
      severity: 'error',
      from: { path: '/src/application/' },
      to: {
        path: ['/src/interface-adapters/', '/src/infrastructure/', '/src/main/'],
      },
    },
    {
      name: 'application-não-importa-libs-de-infra',
      comment:
        'application/ não pode importar Prisma, amqplib, ioredis, @aws-sdk, nodemailer, fastify… ' +
        'A interface fica em application/interfaces/; a implementação fica em infrastructure/.',
      severity: 'error',
      from: { path: '/src/application/' },
      to: {
        dependencyTypes: ['npm'],
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
      name: 'interface-adapters-não-importa-infrastructure-nem-main',
      comment:
        'Controllers em interface-adapters/ recebem o caso de uso. Não importam Prisma, S3, Fastify, factories nem main/.',
      severity: 'error',
      from: { path: '/src/interface-adapters/' },
      to: {
        path: ['/src/infrastructure/', '/src/main/'],
      },
    },
    {
      name: 'interface-adapters-não-importa-libs-de-infra',
      comment: 'interface-adapters/ não importa Fastify, Prisma, amqplib, @aws-sdk…',
      severity: 'error',
      from: { path: '/src/interface-adapters/' },
      to: {
        dependencyTypes: ['npm'],
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
      name: 'nada-importa-main-exceto-o-próprio-main',
      comment: 'Só src/main/ (index, start, factories) importa main/. Testes ficam fora de src/.',
      severity: 'error',
      from: { path: '/src/', pathNot: '/src/main/' },
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
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
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
