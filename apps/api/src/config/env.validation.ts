import Joi from 'joi';

export const envValidationSchema = Joi.object({
  NODE_ENV: Joi.string()
    .valid('development', 'test', 'production')
    .default('development'),
  PORT: Joi.number().port().default(3000),
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
  IS_ACTIVE: Joi.boolean().default(false),
  AI_LLM_PROVIDER: Joi.string().valid('gemini', 'ollama', 'groq').optional(),
  GEMINI_API_KEY: Joi.when('IS_ACTIVE', {
    is: true,
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  GEMINI_LLM_MODEL: Joi.when('IS_ACTIVE', {
    is: true,
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  GEMINI_EMBEDDING_MODEL: Joi.when('IS_ACTIVE', {
    is: true,
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  GROQ_API_KEY: Joi.when('AI_LLM_PROVIDER', {
    is: 'groq',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  GROQ_BASE_URL: Joi.when('AI_LLM_PROVIDER', {
    is: 'groq',
    then: Joi.string().uri().required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  GROQ_LLM_MODEL: Joi.when('AI_LLM_PROVIDER', {
    is: 'groq',
    then: Joi.string().min(1).required(),
    otherwise: Joi.string().allow('').optional(),
  }),
  OLLAMA_BASE_URL: Joi.string()
    .uri()
    .when('IS_ACTIVE', {
      is: false,
      then: Joi.required(),
      otherwise: Joi.optional(),
    }),
  OLLAMA_LLM_MODEL: Joi.string().allow('').optional(),
  OLLAMA_EMBEDDING_MODEL: Joi.string().allow('').optional(),
  OLLAMA_CHAT_MODEL: Joi.string().optional(),
  OLLAMA_EMBED_MODEL: Joi.string().optional(),
  OLLAMA_EMBED_DIMENSION: Joi.number().integer().valid(1024).default(1024),
  MAX_AGENT_STEPS: Joi.number().integer().min(1).max(32).default(8),
  MAX_LLM_CALLS: Joi.number().integer().min(0).max(4).default(2),
  AGENT_REQUEST_TIMEOUT_MS: Joi.number()
    .integer()
    .min(1000)
    .max(2_147_463_647)
    .default(120_000),
  MCP_ENABLED: Joi.boolean().default(false),
  MCP_SERVER_ALLOWLIST: Joi.string().allow('').default(''),
  MCP_TOOL_ALLOWLIST: Joi.string().allow('').default(''),
});
