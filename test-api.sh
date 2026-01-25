curl -X POST http://localhost:3000/api/v1/ask \
  -H "Content-Type: application/json" \
  -H "x-api-key: linux_user_secret_2026" \
  -d '{"question": "Who is the user with the email alice@example.com?"}'