# HackPay on AWS — Bharat Builds Ship It

Deploy this stack so HackPay runs on **Amplify + Cognito + RDS + S3/CloudFront + SNS + EventBridge/Lambda** instead of Vercel/Supabase-only.

## What the stack creates

| Service | Purpose |
|---------|---------|
| **Amazon Cognito** | Email/password auth + `custom:role` (organizer / sponsor / participant) |
| **Amazon RDS Postgres** | Same schema as `infra/sql` (migrated from Supabase) |
| **Amazon S3 + CloudFront** | Receipt / audit JSON objects |
| **Amazon SNS** | Agent alert fan-out |
| **EventBridge + Lambda** | Hourly call to `POST /api/agent/tick` |
| **Amplify Hosting** | Next.js SSR app (`frontend/`) |
| **Secrets Manager** | RDS password + agent cron secret |
| **CloudWatch Logs** | Lambda + RDS logs |

## Prerequisites

1. AWS account with ~$200 credits (Mumbai `ap-south-1` recommended).
2. AWS CLI configured: `aws configure`
3. Node 20+ and CDK CLI: `npm i -g aws-cdk`
4. Bootstrap once per account/region: `cdk bootstrap aws://ACCOUNT/ap-south-1`

## Deploy infrastructure

```bash
cd infra
npm install
npx cdk deploy --all
```

Copy stack outputs:

- `UserPoolId` → `NEXT_PUBLIC_COGNITO_USER_POOL_ID`
- `UserPoolClientId` → `NEXT_PUBLIC_COGNITO_CLIENT_ID`
- `RdsEndpoint` + password from `RdsSecretArn` → `DATABASE_URL`
- `AssetsBucketName` → `NEXT_PUBLIC_S3_BUCKET` / `AWS_S3_BUCKET`
- `CloudFrontUrl` → `NEXT_PUBLIC_CLOUDFRONT_URL`
- `AlertsTopicArn` → `SNS_TOPIC_ARN`
- `AgentCronSecretArn` → value into `AGENT_CRON_SECRET`

### Migrate schema to RDS

```bash
# from repo root
npm install pg
DATABASE_URL='postgresql://hackpay:PASSWORD@HOST:5432/hackpay?sslmode=require' node scripts/migrate-rds.mjs
```

### Wire Amplify

1. Open Amplify console → app `hackpay` (created by CDK).
2. Connect your GitHub repo (root = monorepo, app root `frontend` via `amplify.yml`).
3. Set the env vars from `.env.example` (Cognito, DATABASE_URL, S3, SNS, AGENT_CRON_SECRET, Razorpay).
4. Attach IAM managed policy `HackPayAmplifyRuntime` to the Amplify compute role (S3/SNS/Secrets).
5. After first deploy, note the Amplify URL and re-deploy CDK with:

```bash
cd infra
npx cdk deploy -c appUrl=https://YOURBRANCH.YOURAPP.amplifyapp.com
```

That updates the agent Lambda `APP_URL`.

### Optional: subscribe email to SNS

```bash
aws sns subscribe \
  --topic-arn "$SNS_TOPIC_ARN" \
  --protocol email \
  --notification-endpoint you@college.edu
```

Confirm the subscription email.

## Local run with AWS

```bash
# fill root .env from .env.example + CDK outputs
npm install
cd frontend && npm install
cd ..
npm run migrate:rds
npm run dev
```

Open http://localhost:3000 → `/holder` → Cognito Create account / Sign in.

Check `GET /api/health` — `aws.cognito`, `aws.rds`, `aws.s3`, `aws.sns` should be `true`.

## Demo video talking points

1. Sign up with **Cognito** (role = organizer).
2. Create hackathon; sponsor funds (Razorpay or mock).
3. Dual-approve payout.
4. Show **Lambda/EventBridge** tick (or Run tick) writing inbox + **SNS** alert + **S3** receipt URL.
5. Architecture slide: Amplify → Cognito → RDS → S3/CloudFront → SNS → EventBridge/Lambda.

## Cost notes (free tier / credits)

- RDS `db.t3.micro` ~ always-on; stop it when not demoing if credits are tight.
- Amplify Hosting SSR + Lambda + S3 are cheap for a weekend.
- Destroy when done: `cd infra && npx cdk destroy --all`
