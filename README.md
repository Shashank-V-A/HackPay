# HackPay — dual-control hackathon prizes in INR on AWS

Blockchain-free prize escrow. Sponsors fund via Razorpay; organizers propose winners; both must approve. An agent runs gates then pays out.

**Ship It stack:** Amazon Cognito, RDS Postgres, Amplify, S3/CloudFront, SNS, EventBridge/Lambda. See [AWS.md](./AWS.md).

## Run locally

```bash
npm install
cd frontend && npm install
# copy .env.example → .env (fill from CDK outputs)
npm run migrate:rds
npm run --prefix frontend dev
```

| Route | Role |
|---|---|
| `/` | Landing |
| `/organizer` | Organizer |
| `/holder` | Participant / Cognito sign-in |
| `/verifier` | Sponsor |

## Hosting

Deploy with **AWS Amplify** (`amplify.yml`). Do **not** use Vercel — disconnect any Vercel GitHub integration for this repo so checks stop failing.

## Agents

`POST /api/agent/tick` (secured with `AGENT_CRON_SECRET` or Cognito). On AWS, EventBridge invokes Lambda hourly.
