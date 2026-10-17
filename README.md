# QuestLine

A no-account gamified planner with XP, streaks, recurring habits, a cosmetic shop, and optional Android background deadline reminders. Task data and progress stay in browser storage; only the push subscription and the minimal task details needed to schedule reminders are stored on the server.

## Run locally

```sh
npm install
npm run dev
```

## Android install and push setup

Push is Web Push through Chrome's service worker and VAPID. The app must be served over HTTPS (localhost is okay for local testing). No iOS support is targeted.

1. Deploy the app to HTTPS (for example, Vercel's free Hobby plan).
2. Create a free Upstash Redis database. In its REST API settings, copy the REST URL and token.
3. Generate a VAPID key pair with `npx web-push generate-vapid-keys`. Keep the private key secret; set the public key and private key in the deployment environment. Set `VAPID_SUBJECT` to a `mailto:` address.
4. Create a long random `REMINDER_CRON_SECRET` (e.g. `openssl rand -hex 32`). Add it to the app's environment variables.
5. Configure these environment variables in the deployment and redeploy:
   - `UPSTASH_REDIS_REST_URL`
   - `UPSTASH_REDIS_REST_TOKEN`
   - `VAPID_PUBLIC_KEY`
   - `VAPID_PRIVATE_KEY`
   - `VAPID_SUBJECT`
   - `REMINDER_CRON_SECRET`
6. Add GitHub Actions repository secrets `REMINDER_ENDPOINT` (the deployed URL ending in `/api/reminders/send`) and `REMINDER_CRON_SECRET` (same secret as the app). Enable Actions. The workflow runs hourly and can also be run manually.
7. Install the deployed site from Chrome on Android using **Install app** / **Add to Home screen**, open it, and press **Enable reminders**. Accept Chrome's notification prompt. Keep the task list current; updates sync the reminder schedule.

GitHub scheduled workflows run from the repository's default branch. The workflow must be merged into that branch before hourly scheduled runs will occur. GitHub can delay scheduled starts, and free-tier provider quotas can change; this is free-tier software, not guaranteed delivery. Vercel Hobby cron is deliberately not used because its daily cadence is too coarse.

The service worker sends one notification approximately three hours before a task's due time (hourly scan means actual lead time varies). Completed assignments do not notify. The in-app task list remains the fallback if notifications are blocked or delivery fails. Users can turn reminders off in the app; device subscriptions are keyed by a SHA-256 hash of a random local device token, and the raw token is not stored server-side.

## Study checks

Open **Study check** on an assignment and choose 1–5 questions when creating it. If Groq and the shared rate limiter are configured, the server makes a topic-specific multiple-choice quiz and keeps the answer key off the client. Otherwise, paste study notes into the quiz panel and QuestLine builds a local fill-in-the-blank quiz from the terms in those notes. More than 50% correct is required to finish the task; exactly 50% does not pass. Older tasks previously marked complete without a study check are reopened once so they can be verified.

## AI import (optional)

The Groq credential is only read server-side by `app/api/import/parse/route.ts`; never add a `NEXT_PUBLIC_` prefix. Set `GROQ_API_KEY` in the deployment environment. AI import also requires a shared durable rate-limiter adapter configured with `IMPORT_LIMITER_URL` and `IMPORT_LIMITER_TOKEN`. It expects `{allowed:true|false}` from that trusted adapter. Until configured, AI import fails closed and manual entry remains available.

## Progress and privacy

XP, streak history, shop unlocks, and plans are stored in browser local storage. Export a JSON backup before clearing site data or changing phones. Completing tasks earns XP, consecutive activity earns a 1.5× bonus from day five, and missed deadlines never subtract points. The app icon badge is best-effort and depends on browser support.
