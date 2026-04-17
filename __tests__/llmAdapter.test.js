jest.mock('../config/bedrockService', () => ({
  generateSQLWithBedrock: jest.fn(),
  repairSQLWithBedrock: jest.fn()
}));

const bedrockService = require('../config/bedrockService');
const llmAdapter = require('../services/llmAdapter');

describe('llmAdapter', () => {
  const originalProvider = process.env.LLM_PROVIDER;

  beforeEach(() => {
    jest.clearAllMocks();
    delete process.env.LLM_PROVIDER;
  });

  afterAll(() => {
    if (originalProvider) {
      process.env.LLM_PROVIDER = originalProvider;
      return;
    }
    delete process.env.LLM_PROVIDER;
  });

  test('uses bedrock provider by default for generateSQL', async () => {
    bedrockService.generateSQLWithBedrock.mockResolvedValue('SELECT id FROM users LIMIT 10');

    const sql = await llmAdapter.generateSQL('list users', 'schema');

    expect(sql).toBe('SELECT id FROM users LIMIT 10');
    expect(bedrockService.generateSQLWithBedrock).toHaveBeenCalledWith('list users', 'schema');
  });

  test('uses bedrock provider by default for repairSQL', async () => {
    bedrockService.repairSQLWithBedrock.mockResolvedValue('SELECT id FROM users LIMIT 10');

    const sql = await llmAdapter.repairSQL({
      question: 'list users',
      invalidSql: 'SELECT id FROM users',
      validationError: 'missing LIMIT',
      schemaContext: 'schema'
    });

    expect(sql).toBe('SELECT id FROM users LIMIT 10');
    expect(bedrockService.repairSQLWithBedrock).toHaveBeenCalledTimes(1);
  });

  test('throws for unsupported providers', async () => {
    process.env.LLM_PROVIDER = 'openai';

    await expect(
      llmAdapter.generateSQL('list users', 'schema')
    ).rejects.toThrow('Unsupported LLM provider: openai');
  });
});
