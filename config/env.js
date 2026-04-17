const REQUIRED_ENV = [
  'DATABASE_URL',
  'AWS_ACCESS_KEY_ID',
  'API_KEY_AWS_BEDROCK',
  'AWS_REGION',
  'AWS_BEDROCK_MODEL_ID'
];

function validateEnv() {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const requireLegacySecrets = process.env.ENABLE_V1_V2 !== 'false';
  const requireJwtSecrets = process.env.ENABLE_V3_V5 !== 'false';

  const required = [...REQUIRED_ENV];

  if (requireLegacySecrets) {
    required.push('API_SECRET');
  }

  if (requireJwtSecrets) {
    required.push('JWT_SECRET');
  }

  const missing = required.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

module.exports = {
  validateEnv
};