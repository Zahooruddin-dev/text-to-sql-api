const { ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');
const bedrockClient = require('../config/bedrock');
const SCHEMA = require('../db/schema');

const generateSQL = async (question) => {
  const command = new ConverseCommand({
    modelId: process.env.AWS_BEDROCK_MODEL_ID,
    system: [{ text: SCHEMA }],
    messages: [
      {
        role: 'user',
        content: [{ text: question }]
      }
    ],
    inferenceConfig: {
      maxTokens: 512,
      temperature: 0.1,
      topP: 0.9,
      stopSequences: []
    },
    additionalModelRequestFields: {}
  });

  const response = await bedrockClient.send(command);
  const sql = response.output.message.content[0].text.trim();

  return sql;
};

module.exports = { generateSQL };