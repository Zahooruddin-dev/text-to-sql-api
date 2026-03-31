const REQUIRED_ENV = [
  'DATABASE_URL',
  'AWS_ACCESS_KEY_ID',
  'API_KEY_AWS_BEDROCK',
  'AWS_REGION',
  'AWS_BEDROCK_MODEL_ID',
  'API_SECRET'
];

function validateEnv() {
  if (process.env.NODE_ENV === 'test') {
    return;
  }

  const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}

module.exports = {
  validateEnv
};