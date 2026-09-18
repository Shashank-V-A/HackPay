# HackPay frontend (Next.js)

Hosted on **AWS Amplify** (see repo-root `amplify.yml` and `AWS.md`).

## Local

```bash
# from repo root — .env must include DATABASE_URL + Cognito
npm install
npm run --prefix frontend dev
```

Build check:

```bash
npm run build
```

Requires `DATABASE_URL` (RDS). Cognito env vars enable AWS auth on `/holder`.

## Do not use Vercel

Disconnect Vercel from this GitHub repo (Vercel dashboard → Project → Settings → Git → Disconnect) so GitHub checks stop failing.
