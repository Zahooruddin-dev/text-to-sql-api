const { BedrockRuntimeClient } = require('@aws-sdk/client-bedrock-runtime');
require('dotenv').config();

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.API_KEY_AWS_BEDROCK
  }
});

module.exports = bedrockClient;