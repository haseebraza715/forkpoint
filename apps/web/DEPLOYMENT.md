# Deployment (Vercel + MongoDB Atlas Free Tier)

## 1) MongoDB Atlas (M0 free)
1. Create a free Atlas project and M0 cluster.
2. Create a database user with a strong password.
3. Network Access: add `0.0.0.0/0` (allow from anywhere) for Vercel.
4. Copy the connection string (SRV format).

## 2) Vercel (free)
1. Import this repo in Vercel.
2. Set the project root to `apps/web`.
3. Framework preset: Next.js.

## 3) Environment Variables (Vercel)
Add in Vercel Project Settings → Environment Variables (Development, Preview, Production):
- `MONGODB_URI` = Atlas connection string
- `MONGODB_DB` = database name (e.g. `ai_private_blog`)
- `OPENROUTER_API_KEY` = OpenRouter API key
- `OPENROUTER_MODEL` = default model
- `OPENROUTER_MODEL_EDITOR`
- `OPENROUTER_MODEL_DEFINER`
- `OPENROUTER_MODEL_RISK`
- `OPENROUTER_MODEL_SKEPTIC`
- `OPENROUTER_MODEL_COACH`
- `OPENROUTER_MAX_TOKENS`
- `OPENROUTER_MAX_TOKENS_EDITOR`
- `OPENROUTER_MAX_TOKENS_DEFINER`
- `OPENROUTER_MAX_TOKENS_RISK`
- `OPENROUTER_MAX_TOKENS_SKEPTIC`
- `OPENROUTER_MAX_TOKENS_COACH`
- `OPENROUTER_EVAL_MODEL`
- `OPENROUTER_EVAL_MAX_TOKENS`
- `OPENROUTER_APP_URL` = set to your Vercel URL (not localhost)
- `OPENROUTER_APP_NAME`
- `OPENROUTER_TIMEOUT_MS` = e.g. `30000`
- `EVAL_MODE` = `false` in production
- `EVAL_MODE_ALLOW_PROD` = `false` (only set `true` if you explicitly want eval in prod)

No secrets are committed. All config is via env vars.

## 4) Verify
- Deploy.
- Test API: `POST /api/example` then `GET /api/example`.

## Notes
- Uses the official `mongodb` driver with cached connections to avoid serverless storms.
- Works on Vercel serverless functions and Atlas M0 free tier.
