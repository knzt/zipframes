/** @type {import("dependency-cruiser").IConfiguration} */
export default {
  // base rule: frameworks → adapters → application → domain
  forbidden: [
    {
      name: 'domain-não-importa-nada-externo',
      comment:
        'A camada de domínio (Entities) não pode importar adapters, frameworks, ' +
        'application nem bibliotecas de infraestrutura. ' +
        'Só a biblioteca padrão e pacotes de types são permitidos.',
      severity: 'error',
      from: { path: '/src/domain/' },
      to: {
        path: ['/src/application/', '/src/adapters/', '/src/frameworks/', '/src/main/'],
      },
    },
    {
      name: 'domain-não-importa-infra',
      comment: 'O domínio não pode depender de bibliotecas de infraestrutura.',
      severity: 'error',
      from: { path: '/src/domain/' },
      to: {
        dependencyTypes: ['npm'],
        pathNot: [
          // no domínio só entram tipos e os pacotes de domínio publicados
          // (value objects genéricos e utilitários sem infraestrutura)
          '^@types/',
          '^@zipframes/(value-objects|core)$',
        ],
      },
    },

    {
      name: 'application-não-importa-adapters-nem-frameworks',
      comment:
        'Use Cases só podem importar domain/. ' +
        'Dependências de infraestrutura chegam via ports (inversão de dependência).',
      severity: 'error',
      from: { path: '/src/application/' },
      to: {
        path: ['/src/adapters/', '/src/frameworks/', '/src/main/'],
      },
    },
    {
      name: 'application-não-importa-infra',
      comment:
        'Use Cases não podem importar bibliotecas de infraestrutura diretamente ' +
        '(Prisma, amqplib, ioredis, @aws-sdk, nodemailer, fastify…). ' +
        'Use ports em src/application/ports/.',
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
      name: 'adapters-não-importa-frameworks',
      comment:
        'Interface Adapters recebem clientes de frameworks por injeção de dependência. ' +
        'Não devem importar os módulos de frameworks diretamente.',
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
        'Código compartilhado vem dos pacotes @zipframes/*, publicados em repositório próprio.',
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
    reporterOptions: {
      text: {
        highlightViolations: true,
      },
    },
  },
};
