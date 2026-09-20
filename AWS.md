# HackPay on AWS — Bharat Builds Ship It

Deploy this stack so HackPay runs on **Amplify + Cognito + DynamoDB + S3/CloudFront + SNS + EventBridge/Lambda**.

## What the stack creates

| Service | Purpose |
|---------|---------|
| **Amazon Cognito** | Email/password auth + `custom:role` (organizer / sponsor / participant) |
| **Amazon DynamoDB** | Single-table app data (`hackpay-data`) — replaces RDS |
| **Amazon Bedrock + Strands** | Advisory AI: timeline summaries, smarter notices, repo shortlists |
| **Amazon S3 + CloudFront** | Receipt / audit JSON objects |
| **Amazon SNS** | Agent alert fan-out |
| **EventBridge + Lambda** | Hourly call to `POST /api/agent/tick` |
| **Amplify Hosting** | Next.js SSR app (`frontend/`) |
| **Secrets Manager** | Agent cron secret |
| **CloudWatch Logs** | Lambda logs |

## Prerequisites

1. AWS account with credits (Mumbai `ap-south-1` recommended).
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
- `DynamoTableName` → `DYNAMODB_TABLE_NAME` (usually `hackpay-data`)
- `AssetsBucketName` → `NEXT_PUBLIC_S3_BUCKET` / `AWS_S3_BUCKET`
- `CloudFrontUrl` → `NEXT_PUBLIC_CLOUDFRONT_URL`
- `AlertsTopicArn` → `SNS_TOPIC_ARN`
- `AgentCronSecretArn` → value into `AGENT_CRON_SECRET`

### Wire Amplify

1. Open Amplify console → app `hackpay` (created by CDK).
2. Connect your GitHub repo (root = monorepo, app root `frontend` via `amplify.yml`).
3. Set env vars from `.env.example` (Cognito, `DYNAMODB_TABLE_NAME`, S3, SNS, `AGENT_CRON_SECRET`, Razorpay). Remove any old `DATABASE_URL`.
4. Attach IAM managed policy from stack output `AppRuntimePolicyArn` to the Amplify SSR compute / service role (DynamoDB/S3/SNS/Secrets).
5. After first deploy, note the Amplify URL and re-deploy CDK with:

```bash
cd infra
npx cdk deploy -c appUrl=https://YOURBRANCH.YOURAPP.amplifyapp.com
```

That updates the agent Lambda `APP_URL`.

### Optional: subscribe email to SNS

In the organizer **Dashboard** or **Settings**, use **Agent alert email**, or:

```bash
aws sns subscribe \
  --topic-arn "$SNS_TOPIC_ARN" \
  --protocol email \
  --notification-endpoint you@college.edu
```

Confirm the subscription email. App route: `POST /api/aws/sns/subscribe` with `{ "email": "…" }`.

### Optional: Secrets Manager for Razorpay

Stack output `RazorpaySecretArn` (`hackpay/razorpay`). Put JSON:

```json
{ "RAZORPAY_KEY_ID": "rzp_test_…", "RAZORPAY_KEY_SECRET": "…", "RAZORPAYX_ACCOUNT_NUMBER": "" }
```

Set Amplify `RAZORPAY_SECRET_ARN` (CDK sets it on the Amplify app shell). **Amplify env keys still win** if both are set — secrets only fill gaps.

### Optional: CloudWatch alarm

Stack creates `hackpay-agent-tick-errors` on agent Lambda Errors ≥ 1 and notifies the SNS topic (ops slide).

### Optional: SES winner emails

1. Verify `SES_FROM_EMAIL` in SES (same region).
2. Set Amplify env `SES_FROM_EMAIL`.
3. Saving winners calls `POST /api/notify/winners` (sends only when participants have emails; otherwise SNS-only).

### Optional: WAF on Amplify

Attach an AWS WAF WebACL in the Amplify console (**Hosting → App settings → Access control / WAF**). Not wired in CDK automatically so deploys stay safe; use it as the security checkbox.

## Local run with AWS

```bash
# fill root .env from .env.example + CDK outputs
npm install
cd frontend && npm install
cd ..
npm run dev
```

Open http://localhost:3000 → `/holder` → Cognito Create account / Sign in.

Check `GET /api/health` — `aws.cognito`, `aws.dynamodb`, `aws.s3`, `aws.sns` should be `true`. With Strands on, `aws.strands` is `true`.

### Optional: Razorpay (live Checkout)

Without keys, sponsor funding uses **mock orders** (`order_mock_…`) so Ship It demos still work.

To open real Razorpay Checkout, set on the live Amplify app (`d39l7wna3d1uyn`):

- `RAZORPAY_KEY_ID` = `rzp_test_…` (or live `rzp_live_…`)
- `RAZORPAY_KEY_SECRET` = matching secret
- Optional: `RAZORPAYX_ACCOUNT_NUMBER` for winner payouts

Then redeploy. `amplify.yml` bakes these into `.env.production` for SSR.

Check `GET /api/health` → `razorpayConfigured: true`.

### Enable Bedrock (Strands)

1. In Bedrock console (same region as the app), enable model access for `amazon.nova-lite-v1:0` (or your `BEDROCK_MODEL_ID`).
2. Set `STRANDS_ENABLED=true` and `BEDROCK_MODEL_ID=...` in Amplify / `.env`.
3. Attach updated `AppRuntimePolicyArn` (includes `bedrock:InvokeModel`) to the Amplify service role.
4. Agent tick + `POST /api/agent/advise` will write advisory `payload.agent.suggestions` — organizers still confirm winners; dual-control payouts unchanged.

### Submission assessment (Nasiko + Anakin; not DronaHQ)

1. Participant saves idea + public GitHub URL → DynamoDB (+ optional Supabase mirror).
2. HackPay POSTs to **`NASIKO_GIT_EVAL_URL`** (`agents/git-eval` — local or Nasiko-deployed).
3. Agent uses **Anakin** (`ANAKIN_API_KEY`) to **surf** the GitHub repo URL → markdown, then scores.
4. Agent POSTs assessment to **`POST /api/participants/submissions/assessment`** with `x-hackpay-agent-secret`.
5. Optional **`NASIKO_OBSERVE_WEBHOOK_URL`** for Nasiko traces.
6. UI shows **View report** when `assessment` is present.
7. **Download PDF** → DronaHQ PDF Creator via **`DRONAHQ_PDF_GENERATE_URL`** (Automation webhook running GetPDFURL on a published template). See [PDF Creator overview](https://docs.dronahq.com/pdf-creator-overview/).

See `agents/git-eval/README.md` and `.env.example`.

## Demo video talking points

1. Sign up with **Cognito** (role = organizer).
2. Create hackathon; sponsor funds (Razorpay or mock).
3. **Select Winners** → Get AI shortlist → Preselect → save (humans still confirm).
4. Dual-approve payout.
5. Show **Agent orchestration log** (Dashboard) vs **Event Timeline** (schedule).
6. Show **Lambda/EventBridge** tick writing inbox + **SNS** alert + **CloudFront** receipt link.
7. Architecture: Amplify → Cognito → DynamoDB → **Strands/Bedrock** → S3/CloudFront → SNS → EventBridge/Lambda (+ optional Secrets Manager, CloudWatch alarm, SES, WAF).

## Cost notes

- DynamoDB on-demand is cheap for a weekend demo; no always-on DB instance.
- Amplify Hosting SSR + Lambda + S3 are cheap for a weekend.
- Destroy when done: `cd infra && npx cdk destroy --all`
