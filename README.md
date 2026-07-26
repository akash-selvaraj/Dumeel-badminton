# Shuttle Log — deploy to Vercel

A serverless badminton match tracker: fixed roster with self-set passwords,
daily host-run sessions, check-ins, and fairness-based auto team generation.
Data lives in Upstash Redis via the Vercel KV integration — there's no
database to manage yourself, and no server beyond one small API route.

## 1. Edit the roster

Open `src/App.jsx` and change the `FIXED_USERNAMES` array near the top to
your group's real names:

```js
const FIXED_USERNAMES = ["Akash", "Player 2", "Player 3", "Player 4", "Player 5", "Player 6"];
```

This list is only read once, the first time the app runs with an empty
store — after that the roster lives in Redis, so re-editing this array
later won't change anything unless you clear the `players` key.

## 2. Push to GitHub

```bash
cd shuttle-log
git init
git add .
git commit -m "Shuttle Log"
git branch -M main
git remote add origin <your-empty-github-repo-url>
git push -u origin main
```

## 3. Import into Vercel

1. Go to [vercel.com/new](https://vercel.com/new) and import the GitHub repo.
2. Framework preset: **Vite** (auto-detected). Leave build settings default.
3. Click **Deploy** — it'll build fine even without KV connected yet; the
   app will just show a storage error until step 4 is done.

## 4. Add a KV (Upstash Redis) store

1. In your new Vercel project, go to the **Storage** tab.
2. Click **Create Database → KV** (this provisions an Upstash Redis
   instance for you — no separate Upstash account needed).
3. On the "Connect Project" step, connect it to this project. Vercel
   automatically injects the required env vars
   (`KV_REST_API_URL`, `KV_REST_API_TOKEN`, etc.) — you don't need to
   copy/paste anything.
4. Go to **Deployments** and redeploy (or just push a new commit) so the
   function picks up the new env vars.

## 5. Open the app

Visit your `*.vercel.app` URL. First load seeds the roster from
`FIXED_USERNAMES`. Each person taps their name and sets a password the
first time; after that they just log in.

## Notes

- `api/storage.js` only allows reading/writing the `players` and
  `sessions` keys — nothing else is exposed.
- Passwords are hashed (SHA-256) client-side before being stored; this is
  a casual gate for a friend group, not real account security.
- Everyone who opens the app shares the same roster and match history —
  by design, so the group sees one live log.
- Local dev (`npm run dev`) won't have KV connected unless you pull env
  vars with `vercel env pull` after step 4 — until then, storage calls
  will fail locally, which is expected.
