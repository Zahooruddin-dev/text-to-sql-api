# Text to SQL API

A Node.js REST API that converts natural language questions into SQL queries and runs them against a PostgreSQL database using AWS Bedrock (Claude 3 Haiku).

## Stack

- **Node.js + Express** — API server
- **AWS Bedrock** — Claude 3 Haiku for text to SQL generation
- **Neon PostgreSQL** — cloud database
- **pg** — PostgreSQL client

## Project Structure

```
text-to-sql/
├── server.js
├── package.json
├── .env
├── api.rest
├── config/
│   ├── db.js
│   ├── bedrock.js
│   └── bedrockService.js
├── controller/
│   └── sqlController.js
├── middleware/
│   └── auth.js
├── routes/
│   └── sqlRoutes.js
└── db/
    └── schema.js
```

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Create a `.env` file in the root:

```
DATABASE_URL=postgresql://your_neon_connection_string
PORT=3000
AWS_ACCESS_KEY_ID=AKIA...
API_KEY_AWS_BEDROCK=your_aws_secret_access_key
AWS_REGION=us-east-1
AWS_BEDROCK_MODEL_ID=us.anthropic.claude-3-haiku-20240307-v1:0
API_SECRET=your_api_secret
```

### 3. Create tables in Neon

Run this in your Neon SQL editor:

```sql
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(150) UNIQUE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(150) NOT NULL,
  price NUMERIC(10, 2) NOT NULL,
  stock INT DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
  id SERIAL PRIMARY KEY,
  user_id INT REFERENCES users(id),
  product_id INT REFERENCES products(id),
  quantity INT NOT NULL,
  total NUMERIC(10, 2) NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

INSERT INTO users (name, email) VALUES
  ('Alice Johnson', 'alice@example.com'),
  ('Bob Smith', 'bob@example.com'),
  ('Charlie Brown', 'charlie@example.com');

INSERT INTO products (name, price, stock) VALUES
  ('Laptop', 999.99, 50),
  ('Phone', 499.99, 100),
  ('Tablet', 299.99, 75);

INSERT INTO orders (user_id, product_id, quantity, total) VALUES
  (1, 1, 1, 999.99),
  (2, 2, 2, 999.98),
  (3, 3, 1, 299.99);
```

### 4. Start the server

```bash
npm run dev
```

## API

### Health Check

```
GET /health
```

### Text to SQL

```
POST /api/v1/ask
x-api-key: your_api_secret
Content-Type: application/json

{
  "question": "Get all users"
}
```

**Response:**

```json
{
  "status": "success",
  "question": "Get all users",
  "sql": "SELECT * FROM users;",
  "rowCount": 3,
  "data": [...]
}
```

## Authentication

All requests to `/api/v1/ask` require an `x-api-key` header matching `API_SECRET` in your `.env`.

## Security

Only `SELECT` queries are permitted. The controller blocks any mutation keywords (`INSERT`, `UPDATE`, `DELETE`, `DROP`, `TRUNCATE`, `ALTER`, `CREATE`) even if the LLM generates them.

## AWS Setup

1. Go to AWS Console → IAM → Users → Create user
2. Attach policy: `AmazonBedrockFullAccess`
3. Security credentials → Create access key
4. Copy both the Access Key ID and Secret Access Key into `.env`