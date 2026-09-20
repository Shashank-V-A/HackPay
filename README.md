# HackPay

Dual-control prize escrow for hackathons, settled in **INR**.

Sponsors lock the prize pool. Organizers run the event and propose winners. Money only moves when **both** sides approve. Participants get paid over UPI/IMPS via Razorpay.

AWS runs auth, data, hosting, receipts, and the orchestration agent. Razorpay moves the money. The agent can advise and nudge — it cannot approve payouts alone.

Live docs in the app: `/docs`

## How it works

1. Organizer creates a hackathon and sets the prize pool  
2. Sponsor funds escrow (Razorpay Checkout, or mock orders without keys)  
3. Participants register and add payout details  
4. Organizer selects winners (optional Bedrock/Strands shortlist is advice only)  
5. Organizer proposes the payout → sponsor co-approves  
6. Execute runs payment/git gates, then RazorpayX (or `pout_queued_…` if X isn’t set up)  
7. Audit JSON is stored on S3 and served through CloudFront  

## Tech stack

| Layer | Choice |
|--------|--------|
| App | Next.js 15 (App Router), React 18, TypeScript |
| Payments | Razorpay Checkout + RazorpayX (INR) |
| Auth | Amazon Cognito |
| Database | Amazon DynamoDB (single-table) |
| Hosting | AWS Amplify (SSR) |
| Infra | AWS CDK (`infra/`) |
| Agent / AI | EventBridge → Lambda tick; Strands SDK + Amazon Bedrock (advisory) |
| Receipts / alerts | S3, CloudFront, SNS |
| Secrets / ops | Secrets Manager, CloudWatch |

Repo layout:

- `frontend/` — Next.js app (portals + APIs)  
- `infra/` — CDK stack  
- `AWS.md` — deploy notes  
- `backend.md` — API / money-flow overview  

## AWS services we use

- **Cognito** — email/password sign-in; roles: organizer, sponsor, participant  
- **Amplify** — hosts the Next.js app  
- **DynamoDB** — events, participants, winners, proposals, agent state  
- **S3 + CloudFront** — payout audit receipts  
- **SNS** — agent email alerts (subscribe from the organizer dashboard)  
- **EventBridge + Lambda** — hourly call to `/api/agent/tick`  
- **Bedrock** (via Strands) — winner shortlist / notices; humans still confirm  
- **Secrets Manager** — agent cron secret; optional Razorpay keys  
- **CloudWatch** — Lambda logs and an error alarm on the agent function  

Razorpay is not an AWS service — it’s the bank rail. Everything else above is the control plane.

## Local setup

```bash
# 1. Copy env and fill Cognito / DynamoDB / Razorpay from CDK outputs
cp .env.example .env

# 2. Install
npm install
cd frontend && npm install && cd ..

# 3. Run
npm run dev
```

Open http://localhost:3000  

Deploy infra (once per account/region):

```bash
cd infra
npm install
npx cdk deploy --all
```

Details: [AWS.md](./AWS.md)

## Team

Built for AWS Builder Center / Ship It as **ciphers_2.0**:

| Member | Role |
|--------|------|
| Shashank VA | Lead — architecture, AWS, Razorpay, agent, deploy |
| Karthik M | Backend / DynamoDB, participant APIs & portal |
| Preetika Kour | Product UX, role flows, demo walkthrough |
| Gayathri SR | QA, docs, demo readiness |

## Notes

- Without Razorpay keys, funding uses mock orders so demos still work.  
- Without RazorpayX, payouts may show as `pout_queued_…` (queued, not a bank credit).  
- If either side refuses to approve, funds stay locked — no auto-refund yet.
