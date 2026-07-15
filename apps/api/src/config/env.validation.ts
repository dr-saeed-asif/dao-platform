import Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
  DATABASE_URL: Joi.string().required(),
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
  MLDSA_SECRET_KEY: Joi.string().allow('').optional(),
  MLDSA_LEVEL: Joi.number().valid(44, 65, 87).required(),
  EXPECTED_SENDER_ADDRESS: Joi.string().required(),
  DEV_AUTH_BYPASS_ENABLED: Joi.boolean().default(false),
  JWT_SECRET: Joi.string().min(32).required(),
});
