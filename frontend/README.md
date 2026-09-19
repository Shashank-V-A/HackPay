# HackPay frontend

Hosted on **AWS Amplify** (see repo-root `amplify.yml` and `AWS.md`).

```bash
# from repo root — .env must include DYNAMODB_TABLE_NAME + Cognito
cp .env.example .env
# then fill Cognito / DynamoDB / S3 / SNS from CDK outputs

cd frontend
npm install
npm run dev
```

Requires `DYNAMODB_TABLE_NAME` (DynamoDB). Cognito env vars enable AWS auth on `/holder`.
