import { envValidationSchema } from './env.validation';

// Regression tests for review finding C2: a production boot must refuse the
// development auth bypass and placeholder/weak JWT secrets. The fixtures contain
// no real credentials.
const STRONG_SECRET = 'q7Vn2xK9pLr4TzW8mB3cY6hJ1dF5gS0aEuXo';

const baseEnv = (overrides: Record<string, unknown> = {}) => ({
  POSTGRES_URL: 'postgresql://localhost:5432/example',
  DAO_ADMIN_ADDRESS: '0x0000000000000000000000000000000000000001',
  SIGN_MODE: 'ec-dsa',
  ECDSA_PRIVATE_KEY: 'test-only-not-a-key',
  MLDSA_PUBLIC_KEY: 'test-only-not-a-key',
  MLDSA_LEVEL: 65,
  EXPECTED_SENDER_ADDRESS: '0x0000000000000000000000000000000000000001',
  JWT_SECRET: STRONG_SECRET,
  ...overrides,
});

const validate = (env: Record<string, unknown>) => envValidationSchema.validate(env);

describe('environment validation: production safety (C2)', () => {
  it('accepts a hardened production configuration', () => {
    const { error } = validate(baseEnv({ NODE_ENV: 'production' }));
    expect(error).toBeUndefined();
  });

  it('refuses to boot production with the development auth bypass enabled', () => {
    const { error } = validate(
      baseEnv({ NODE_ENV: 'production', DEV_AUTH_BYPASS_ENABLED: 'true' }),
    );
    expect(error?.message).toContain('DEV_AUTH_BYPASS_ENABLED');
  });

  it.each([
    'replace-with-a-long-development-secret',
    'REPLACE-WITH-A-LONG-DEVELOPMENT-SECRET',
    'changeme-changeme-changeme-changeme-changeme',
    'a'.repeat(40),
    'secretsecretsecretsecretsecretsecret',
  ])('refuses to boot production with a placeholder or weak JWT_SECRET (%s)', (JWT_SECRET) => {
    const { error } = validate(baseEnv({ NODE_ENV: 'production', JWT_SECRET }));
    expect(error?.message).toContain('JWT_SECRET');
  });

  it('keeps the minimum JWT_SECRET length in every environment', () => {
    for (const NODE_ENV of ['development', 'test', 'production']) {
      expect(validate(baseEnv({ NODE_ENV, JWT_SECRET: 'too-short' })).error).toBeDefined();
    }
  });

  it('does not break local development or tests', () => {
    for (const NODE_ENV of ['development', 'test']) {
      const { error } = validate(
        baseEnv({
          NODE_ENV,
          DEV_AUTH_BYPASS_ENABLED: 'true',
          JWT_SECRET: 'replace-with-a-long-development-secret',
        }),
      );
      expect(error).toBeUndefined();
    }
  });

  it('never echoes the rejected secret value in the error message', () => {
    const { error } = validate(
      baseEnv({ NODE_ENV: 'production', JWT_SECRET: 'replace-with-a-long-development-secret' }),
    );
    expect(error?.message).not.toContain('replace-with-a-long-development-secret');
  });
});
