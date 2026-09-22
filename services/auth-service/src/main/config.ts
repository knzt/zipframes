export type Config = {
  readonly port: number;
  readonly corsOrigin: string;
  readonly databaseUrl: string;
  readonly amqpUrl: string;
  readonly jwtPrivateKeyPem: string;
  readonly jwtKid: string;
  readonly jwtIssuer: string;
  readonly jwtAudience: string;
  readonly outboxIntervalMs: number;
};

const required = (name: string): string => {
  const value = process.env[name];
  if (value === undefined || value.length === 0) {
    throw new Error(`missing required environment variable: ${name}`);
  }
  return value;
};

export const loadConfig = (): Config => ({
  port: Number(process.env.PORT ?? '3000'),
  corsOrigin: process.env.CORS_ORIGIN ?? '*',
  databaseUrl: required('AUTH_DATABASE_URL'),
  amqpUrl: required('AMQP_URL'),
  jwtPrivateKeyPem: required('JWT_PRIVATE_KEY_PEM'),
  jwtKid: required('JWT_KID'),
  jwtIssuer: required('JWT_ISSUER'),
  jwtAudience: required('JWT_AUDIENCE'),
  outboxIntervalMs: Number(process.env.OUTBOX_INTERVAL_MS ?? '2000'),
});
