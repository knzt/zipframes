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
  },
};
