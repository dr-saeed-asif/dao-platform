import Joi from 'joi';

const PLACEHOLDER_FRAGMENTS = [
  'replace-with',
  'changeme',
  'change-me',
  'placeholder',
  'development-secret',
  'your-secret',
  'example',
];

function isWeakSecret(secret: unknown): boolean {
  if (typeof secret !== 'string') return true;
  const lowered = secret.toLowerCase();
  if (PLACEHOLDER_FRAGMENTS.some((fragment) => lowered.includes(fragment))) return true;
  return new Set(secret).size < 10;
}

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  API_HOST: Joi.string().default('0.0.0.0'),
  DATABASE_URL: Joi.string().optional(),
  POSTGRES_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  ARTEFACT_STORAGE_DIR: Joi.string().default('../../data/artefacts'),
  ARTEFACT_MAX_FILE_SIZE: Joi.number().integer().min(1).default(10_485_760),
  ARTEFACT_MAX_FILES: Joi.number().integer().min(1).max(20).default(10),
  CYBERCHAIN_RPC_URL: Joi.string().allow('').optional(),
  CYBERCHAIN_CHAIN_ID: Joi.string().allow('').optional(),
  GOVERNANCE_CONTRACT_ADDRESS: Joi.string().allow('').optional(),
  GOVERNANCE_DEPLOYMENT_BLOCK: Joi.number().integer().min(0).default(0),
  VOTE_INDEXER_ENABLED: Joi.boolean().default(true),
  VOTE_INDEXER_INTERVAL_MS: Joi.number().integer().min(5000).default(30000),
  VOTE_INDEXER_BLOCK_RANGE: Joi.number().integer().min(1).default(1000),
  DAO_ADMIN_ADDRESS: Joi.string().required(),
  SIGN_MODE: Joi.string().valid('ec-dsa', 'ml-dsa').required(),
  ECDSA_PRIVATE_KEY: Joi.string().required(),
  MLDSA_PUBLIC_KEY: Joi.string().required(),
  MLDSA_LEVEL: Joi.number().valid(44, 65, 87).required(),
  MLDSA_SECRET_KEY: Joi.string().allow('').optional(),
  EXPECTED_SENDER_ADDRESS: Joi.string().required(),
  DEV_AUTH_BYPASS_ENABLED: Joi.boolean().default(false),
  JWT_SECRET: Joi.string().min(32).required(),
  AI_SERVER_URL: Joi.string().uri().optional(),
  AI_SERVER_TOKEN: Joi.string().min(24).optional(),
}).custom((env, helpers) => {
  // Boot-time production guards (review finding C2). Messages never include secret values.
  if (env.NODE_ENV !== 'production') return env;
  if (env.DEV_AUTH_BYPASS_ENABLED) {
    return helpers.message({
      custom: 'DEV_AUTH_BYPASS_ENABLED must be false when NODE_ENV=production.',
    });
  }
  if (isWeakSecret(env.JWT_SECRET)) {
    return helpers.message({
      custom:
        'JWT_SECRET must be a unique random value when NODE_ENV=production (placeholder or low-entropy secrets are rejected).',
    });
  }
  return env;
});
