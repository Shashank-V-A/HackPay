# HackPay

Agentic dual-control hackathon prize escrow in **INR** via Razorpay, hosted on AWS.

**Ship It stack:** Amazon Cognito, DynamoDB, Amplify, S3/CloudFront, SNS, EventBridge/Lambda. See [AWS.md](./AWS.md).

```bash
# fill .env from .env.example after CDK deploy
npm install
cd frontend && npm install && cd ..
npm run dev
```
