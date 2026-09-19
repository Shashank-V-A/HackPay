## Backend Overview (AWS + INR)

HackPay’s runtime is the Next.js app in `frontend/` (Amplify Hosting SSR). Escrow and payouts use **Razorpay (INR)**, not Stellar. Persistence is **DynamoDB**. Orchestration is advisory **Strands + Bedrock** plus an EventBridge→Lambda tick. Full deploy notes: **[AWS.md](./AWS.md)**.

### Money flow (INR)

1. Sponsor funds the prize pool via Razorpay Checkout (or mock `order_mock_…` without keys).
2. Organizer selects winners (optional Strands AI shortlist — advisory only).
3. Organizer proposes payout → sponsor co-approves (dual control).
4. Agent tick / execute runs payment + git gates, then posts a RazorpayX payout id or `pout_queued_…` placeholder when RazorpayX is unavailable.
5. Audit JSON lands in S3 and is linked via CloudFront; SNS can alert subscribers.

### HTTP API (App Router)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/escrow/propose` | Create payout proposal |
| POST | `/api/escrow/approve` | Sponsor co-approval |
| POST | `/api/escrow/execute` | Gated INR release |
| POST | `/api/agent/tick` | Orchestration tick |
| POST | `/api/agent/advise` | Strands winner shortlist + timeline |
| POST | `/api/aws/sns/subscribe` | Email subscribe to agent alerts |
| POST | `/api/notify/winners` | Optional SES “you won” + SNS |
| GET | `/api/health` | Config probe |

Shared escrow logic: `frontend/src/lib/backend/escrowHandlers.ts`. Razorpay client: `frontend/src/lib/backend/razorpayClient.ts` (optional Secrets Manager hydrate when Amplify env is empty).

### Runtime configuration

See `.env.example` and Amplify env. Important keys:

- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` (or `RAZORPAY_SECRET_ARN`)
- `DYNAMODB_TABLE_NAME`
- Cognito `NEXT_PUBLIC_COGNITO_*`
- `NEXT_PUBLIC_S3_BUCKET` / `NEXT_PUBLIC_CLOUDFRONT_URL`
- `SNS_TOPIC_ARN`
- `STRANDS_ENABLED` / `BEDROCK_MODEL_ID`
- Optional: `SES_FROM_EMAIL` (verified SES identity)

Copy `.env.example` → `.env` at the repo root. Next loads it from the parent folder.

### What replaced Stellar

Older docs referred to Soroban/XLM and `STELLAR_*` env vars. Those paths are retired. Prize amounts are **INR rupees**; receipts are Razorpay ids or queued placeholders, not Horizon tx hashes.
