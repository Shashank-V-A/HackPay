# HackPay Git Eval Agent (Nasiko + Anakin)

Standalone agent that **does not use DronaHQ**. Canonical Nasiko copy lives at
`E:\buildaws\nasiko\agents\hackpay-git-eval` (same sources).

| Piece | Role |
|--------|------|
| **This agent** | Scores GitHub submissions |
| **Anakin** | Surfs the public GitHub repo URL → markdown |
| **Nasiko** | Deploy + observe this agent |
| **HackPay** | Saves submission, calls agent, stores assessment |

## Local run

```powershell
cd agents/git-eval
# loads ANAKIN_API_KEY from agents/git-eval/.env or HackPay/.env
node server.js
# default PORT=8000 (Nasiko convention)
```

Smoke test:

```powershell
Invoke-RestMethod -Method POST -Uri http://127.0.0.1:8000/evaluate -ContentType application/json -Body '{"idea":"prize escrow","githubUrl":"https://github.com/octocat/Hello-World"}'
```

## Point HackPay

```env
NASIKO_GIT_EVAL_URL=http://127.0.0.1:8000/evaluate
SUBMISSION_AGENT_CALLBACK_SECRET=...
```

## Deploy on Nasiko

```powershell
nasiko up
cd E:\buildaws\nasiko\agents\hackpay-git-eval
.\deploy.ps1
```

Then set `NASIKO_GIT_EVAL_URL` to the deployed agent `/evaluate` URL from `nasiko ps`.

## Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/health` | Health + Anakin flag |
| GET | `/.well-known/agent.json` | AgentCard for Nasiko |
| POST | `/evaluate` | Run eval + optional HackPay callback |
| POST | `/` | A2A JSON-RPC for Nasiko chat/proxy |
