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
  JWT_SECRET: Joi.string().min(32).required(),
});
