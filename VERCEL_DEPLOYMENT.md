# NutriBlogHub backend — Vercel deployment

The backend is an Express application exported from the repository-root `server.js`. Vercel detects this Express entry point automatically; no custom rewrite file or `app.listen()` is used by the Vercel runtime.

## Vercel project settings

1. Import `Divinity-dev/Nutrilog-backend` into Vercel.
2. Select `main` as the Production Branch.
3. Set the Root Directory to the repository root (leave it as `.`).
4. Use the Node.js runtime specified by `engines.node` in `package.json` (22.x).
5. Leave the Build Command and Output Directory at their defaults; this is a backend Express project, not a static frontend.
6. Deploy a Preview first. Do not disable the previous host until the Preview and then Production deployment have passed the checks below.

## Required environment variables

Add these in Vercel → Project → Settings → Environment Variables. Add them to Preview and Production as appropriate. Never commit real values to GitHub.

- `MONGODB_URI`: the MongoDB connection string, including the database name. The application also accepts the legacy `Mongo_url` variable, but prefer `MONGODB_URI`.
- `JWT_SECRET`: a long, random secret (at least 32 random bytes).
- `ADMIN_EMAIL`: `divine_asiriuwa@yahoo.com`.
- `ADMIN_BOOTSTRAP_SECRET`: a separate, long, random, one-time secret for initial administrator setup.
- `FRONTEND_URL`: `https://www.nutribloghub.com,https://nutribloghub.com`.
- `SMTP_HOST=smtp.gmail.com`.
- `SMTP_PORT=465`.
- `SMTP_SECURE=true`.
- `SMTP_USER=asiriuwadivine@gmail.com`.
- `SMTP_PASS`: a Google App Password for that Gmail account (not your normal Gmail password).
- `MAIL_FROM`: for example, `NutriBlogHub <asiriuwadivine@gmail.com>`, or a verified sender address you control.
- `GEMINI_API_KEY`: required for manual and scheduled AI article generation.
- `CRON_SECRET`: required by the scheduled `/api/ai/cron` endpoint; Vercel sends it as a Bearer token to the configured cron route.
- `PEXELS_API_KEY`: optional; when absent or unavailable, scheduled articles reuse a random image from earlier published articles. The previous image is avoided when other images are available.

If the MongoDB provider uses IP access restrictions, configure access for Vercel according to that provider's current networking options. Do not use a local development database address.

## Recommended API domain and frontend setting

Connect a custom domain such as `api.nutribloghub.com` to the Vercel backend project. Then set the frontend's `NEXT_PUBLIC_API_URL` to:

```env
NEXT_PUBLIC_API_URL=https://api.nutribloghub.com
```

The frontend currently makes requests to paths beginning with `/api`, so do not append `/api` to this base URL. Using an API subdomain under `nutribloghub.com` keeps the frontend and API on the same site for browser cookie behavior. Keep `withCredentials: true` on login and protected requests.

## Initial administrator setup

1. Deploy the backend Preview with the environment variables above.
2. Register `divine_asiriuwa@yahoo.com` through the website's registration flow.
3. Send one POST request to `https://<preview-or-api-domain>/api/user/bootstrap-admin` with JSON body:
   `{"bootstrapSecret":"THE_ADMIN_BOOTSTRAP_SECRET_VALUE"}`
4. The API promotes only the account whose email matches `ADMIN_EMAIL`. A repeated bootstrap attempt is rejected.
5. Log in normally. After successful initialization, remove `ADMIN_BOOTSTRAP_SECRET` from the Vercel environment and redeploy.

Do not send the bootstrap secret or other environment secrets in chat.

## Smoke tests after deployment

- `GET /` returns JSON indicating the API is running.
- `GET /health` returns `{"status":"ok","service":"nutribloghub-api"}`.
- `GET /api/post/posts` returns the public article list.
- `GET /api/category/categories` returns the public category list.
- `POST /api/user/register` creates an ordinary user, never an administrator.
- `POST /api/user/login` sets the HttpOnly session cookie.
- `GET /api/user/me` succeeds with that cookie.
- Article create/update/delete and subscriber-list endpoints reject unauthenticated or non-admin requests.

## Scheduled AI publishing

`vercel.json` runs `/api/ai/cron` daily at 08:05 UTC (09:05 in `Africa/Lagos`). The schedule document in MongoDB decides whether today is an enabled publishing day and whether the article is saved as a draft or published. Set `GEMINI_API_KEY` and `CRON_SECRET` in the Vercel Preview environment before testing. Pexels is optional; the image fallback reuses an image from an earlier published article. If no earlier article has an image, the article is still generated without a featured image.

## Serverless notes

- The MongoDB connection is cached on the warm Node.js instance and reused.
- The app does not call `app.listen()` when Vercel imports it.
- Newsletter email sends are deliberately not launched with `setImmediate()` after an HTTP response; serverless background work needs a durable queue or Vercel-supported background execution. Email delivery uses Nodemailer with Gmail SMTP settings supplied through environment variables. Newsletter delivery is not launched as detached background work from article creation.
- Express static file serving is not used. If static assets are needed, place them under `public/` for Vercel's CDN.
