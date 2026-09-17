# The store, on Supabase

`docs/ACCOUNTS.md` is the design and the argument. This is the setup, once,
by the person who owns the project.

## Create the project

- **Region: EU** (Frankfurt or another EU region). The analytics processor
  is EU-hosted and this should be too.
- **Plan:** know that the free tier pauses a project after a week without
  traffic, and a paused project means a tester's restore fails on the day
  they need it. Either take the paid plan or accept that risk knowingly.
- **Sign the DPA** in the dashboard under the organisation's legal
  settings. Supabase is our processor for special-category data; that
  agreement is one of the costs POSITIONING.md names.

## Enable Sign in with Apple

Authentication → Providers → Apple. Native sign-in on iOS needs the app's
**bundle identifier** (`com.itaiagami.pattern`) in the Client IDs field; the
web Services ID is not needed for a native-only app.

**Request no scopes from Apple.** The design deliberately never asks for
the person's email. Verify on the first real sign-in what lands in
`auth.users` with no scopes requested, and if Supabase insists on an email,
use Apple's relay address and never display or export it.

## Apply the migration and deploy the function

```bash
npx supabase@latest link --project-ref <ref>
npx supabase@latest db push
npx supabase@latest functions deploy delete-account
```

The function reads `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY`, which Supabase injects into every function's
environment automatically. **The service role key never goes anywhere
else** — not the app, not `app.json`, not a commit.

## What the app needs

Two values, both public by design: the project URL and the **anon** key.
Row Level Security is the security boundary, not the key. They go in
`app.config.js` under `extra` so they ship in the bundle like any other
configuration, and SPEC's "no secret in the client" holds because neither
is a secret.

## What you will see in the dashboard

Rows of base64 in `public.copies`. That is the promise, visible: the
project owner sees exactly what an attacker with the database would see,
and neither can open a single one.
