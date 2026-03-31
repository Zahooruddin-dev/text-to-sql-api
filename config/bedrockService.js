const { ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const bedrockClient = require('../config/bedrock');
const SCHEMA = require('../db/schema');

const MAX_TOKENS = Number(process.env.BEDROCK_MAX_TOKENS || 512);
const TEMPERATURE = Number(process.env.BEDROCK_TEMPERATURE || 0.1);

function extractText(response) {
  return response && response.output && response.output.message && response.output.message.content
    ? String(response.output.message.content[0].text || '').trim()
    : '';
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

  const response = await bedrockClient.send(command);
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

  const response = await bedrockClient.send(command);
  return extractText(response);
};

module.exports = { generateSQL, repairSQL };