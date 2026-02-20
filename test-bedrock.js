require('dotenv').config();
const { BedrockRuntimeClient, ConverseCommand } = require('@aws-sdk/client-bedrock-runtime');

const client = new BedrockRuntimeClient({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.API_KEY_AWS_BEDROCK
  }
});

console.log('Access Key ID:', process.env.AWS_ACCESS_KEY_ID);
console.log('Secret Key length:', process.env.API_KEY_AWS_BEDROCK?.length);
console.log('Region:', process.env.AWS_REGION);
console.log('Model ID:', process.env.AWS_BEDROCK_MODEL_ID);

const run = async () => {
  const command = new ConverseCommand({
    modelId: process.env.AWS_BEDROCK_MODEL_ID,
    messages: [{ role: 'user', content: [{ text: 'say hi' }] }],
    inferenceConfig: { maxTokens: 50 }
  });

  const response = await client.send(command);
  console.log('SUCCESS:', response.output.message.content[0].text);
};

run().catch(err => console.error('ERROR:', err.message));