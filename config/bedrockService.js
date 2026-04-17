const { ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const bedrockClient = require('../config/bedrock');
const SCHEMA = require('../db/schema');

const MAX_TOKENS = Number(process.env.BEDROCK_MAX_TOKENS || 512);
const TEMPERATURE = Number(process.env.BEDROCK_TEMPERATURE || 0.1);
const TIMEOUT_MS = Number(process.env.BEDROCK_TIMEOUT_MS || 15000);
const MAX_RETRIES = Math.max(0, Number(process.env.BEDROCK_MAX_RETRIES || 1));
const RETRY_BASE_MS = Math.max(50, Number(process.env.BEDROCK_RETRY_BASE_MS || 200));

function extractText(response) {
  return response && response.output && response.output.message && response.output.message.content
    ? String(response.output.message.content[0].text || '').trim()
    : '';
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeoutError() {
  const err = new Error(`Bedrock request timed out after ${TIMEOUT_MS}ms`);
  err.code = 'BEDROCK_TIMEOUT';
  return err;
}

function withTimeout(promise) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(timeoutError()), TIMEOUT_MS);
    })
  ]);
}

async function sendWithRetry(command) {
  let lastError;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    try {
      return await withTimeout(bedrockClient.send(command));
    } catch (err) {
      lastError = err;
      if (attempt >= MAX_RETRIES) {
        break;
      }
      await sleep(RETRY_BASE_MS * (attempt + 1));
    }
  }

  if (!lastError) {
    throw new Error('Bedrock request failed');
  }

  throw lastError;
}

const generateSQL = async (question, schemaContext) => {
  const command = new ConverseCommand({
    modelId: process.env.AWS_BEDROCK_MODEL_ID,
    system: [{ text: schemaContext || SCHEMA }],
    messages: [
      {
        role: 'user',
        content: [{ text: question }]
      }
    ],
    inferenceConfig: {
      maxTokens: MAX_TOKENS,
      temperature: TEMPERATURE,
      topP: 0.9,
      stopSequences: []
    },
    additionalModelRequestFields: {}
  });

  const response = await sendWithRetry(command);
  const sql = extractText(response);

  return sql;
};

const repairSQL = async ({ question, invalidSql, validationError, schemaContext }) => {
  const repairPrompt = [
    `Original user question: ${question}`,
    `Invalid SQL: ${invalidSql}`,
    `Validation error: ${validationError}`,
    'Return a corrected SQL query that strictly follows the rules.'
  ].join('\n');

  const command = new ConverseCommand({
    modelId: process.env.AWS_BEDROCK_MODEL_ID,
    system: [{ text: schemaContext || SCHEMA }],
    messages: [{ role: 'user', content: [{ text: repairPrompt }] }],
    inferenceConfig: {
      maxTokens: MAX_TOKENS,
      temperature: 0,
      topP: 0.9,
      stopSequences: []
    },
    additionalModelRequestFields: {}
  });

  const response = await sendWithRetry(command);
  return extractText(response);
};

module.exports = { generateSQL, repairSQL };