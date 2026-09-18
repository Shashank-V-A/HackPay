# HackPay — dual-control hackathon prizes in INR (AWS Ship It ready)

Blockchain-free prize escrow for Web2 events. Prize funds sit in a **Razorpay INR vault** until **both sponsor and organizer** approve. Agentic gates must pass before winners are paid.

**Bharat Builds / Ship It:** see [AWS.md](./AWS.md) for Cognito, RDS, Amplify, S3, SNS, and EventBridge/Lambda.

## What it solves

Sponsors worry prize money will be misused; organizers do not want to front cash; winners want a guaranteed INR payout. Dual approval plus agents coordinate funding → winners → payout.

## AWS architecture (Ship It)

| Layer | Service |
|-------|---------|
| Hosting | Amplify Hosting (Next.js SSR) |
| Auth | Amazon Cognito (`custom:role`) |
| Database | Amazon RDS Postgres |
| Assets | S3 + CloudFront |
| Alerts | SNS |
| Agent cron | EventBridge → Lambda → `/api/agent/tick` |

Local demo can still use Supabase if `DATABASE_URL` is unset.

## Money path

1. Sponsor funds the prize pool (Razorpay order / mock receipt if keys unset).
2. Organizer proposes winners (UPI or bank account + INR amounts).
3. Sponsor co-approves.
4. Orchestration agent executes payouts (RazorpayX when configured, otherwise mock receipts).

## Run locally

```bash
npm install
cd frontend && npm install
```

Create `.env` from `.env.example`. For AWS Ship It, fill Cognito + `DATABASE_URL` + S3/SNS after `cd infra && npx cdk deploy`.

```bash
npm run migrate:rds   # when using RDS
npm run dev
```

Open http://localhost:3000. Sign in with **Cognito** when pool env vars are set, otherwise email + role (local demo).

| Route | Role |
|---|---|
| `/` | Landing |
| `/organizer` | Organizer console |
| `/holder` | Participant |
| `/verifier` | Sponsor |

## Agents

`POST /api/agent/tick` is the orchestration loop (secured with `AGENT_CRON_SECRET` or Cognito). On AWS, EventBridge invokes Lambda hourly.
