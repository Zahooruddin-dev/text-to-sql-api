const {
  generateSQLWithBedrock,
  repairSQLWithBedrock
} = require('../config/bedrockService');

function getActiveProvider() {
  return String(process.env.LLM_PROVIDER || 'bedrock').toLowerCase();
}

function assertProvider(provider) {
  if (provider !== 'bedrock') {
    throw new Error(`Unsupported LLM provider: ${provider}`);
  }
}

async function generateSQL(question, schemaContext) {
  const provider = getActiveProvider();
  assertProvider(provider);
  return generateSQLWithBedrock(question, schemaContext);
}

async function repairSQL(payload) {
  const provider = getActiveProvider();
  assertProvider(provider);
  return repairSQLWithBedrock(payload);
}

module.exports = {
  generateSQL,
  repairSQL,
  getActiveProvider
};
