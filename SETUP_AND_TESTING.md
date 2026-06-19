# Setup & Testing Guide

## 1. Install new dependencies

```bash
cd /Users/ashmitamalik66gmail.com/Desktop/Life-decision-simulator-main-2
npm install @supabase/supabase-js
```

No new dependency is needed for email (we call Resend's HTTP API directly with `fetch`, no SDK required) or for the flowchart (it's plain SVG via React, no charting library).

## 2. Copy in the new/changed files

| File | Action |
|---|---|
| `lib/supabase.ts` | new |
| `lib/crisisDetection.ts` | new |
| `lib/toneReview.ts` | new |
| `lib/localHistory.ts` | new |
| `components/CrisisSupport.tsx` | new |
| `components/ProfileAndFollowUp.tsx` | new |
| `components/DecisionFlowchart.tsx` | new |
| `app/api/crisis-check/route.ts` | new |
| `app/api/profile/route.ts` | new |
| `app/api/send-email/route.ts` | new |
| `app/api/history/route.ts` | new |
| `app/history/page.tsx` | new |
| `app/page.tsx` | **replace** — full file provided, preserves all existing features (toggles, timeline, chat) and adds the new flow on top |
| `app/api/analyze/route.ts` | **edit by hand** — see `app/api/analyze/PATCH_NOTES.md` for the exact additions, since I didn't have your current file content to safely overwrite |

## 3. Environment variables

Add to `.env.local` (create the file if it doesn't exist):

```
# Already have this:
OPENROUTER_API_KEY=your_existing_key

# Add when ready — app works without these, just in degraded/local mode:
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
RESEND_API_KEY=
RESEND_FROM_ADDRESS=
```

Confirm `.env.local` is listed in `.gitignore` before committing anything — it should be there by default in a Next.js project, but double check since this repo is shared with Pranav.

## 4. Supabase setup (when ready)

1. Create a project at supabase.com (see earlier instructions in this conversation).
2. Open **SQL Editor** → paste the contents of `sql/schema.sql` → Run.
3. Confirm three tables appear under **Table Editor**: `profiles`, `decisions`, `crisis_events`.
4. Copy your **rotated** Project URL, anon key, and service_role key into `.env.local` directly (not into chat).
5. Restart `npm run dev` so Next.js picks up the new env vars.

## 5. Resend setup (when ready)

1. Sign up at resend.com (free tier is generous).
2. Get an API key from the dashboard.
3. Add `RESEND_API_KEY` to `.env.local`.
4. For testing, you can leave `RESEND_FROM_ADDRESS` unset — it defaults to Resend's sandbox sender (`onboarding@resend.dev`), which works without domain verification but may land in spam. For a real deployment, verify your own domain in Resend and set `RESEND_FROM_ADDRESS`.

## 6. Testing checklist

**Crisis detection (test carefully, this matters):**
- Enter a scenario containing a clear self-harm-related phrase → should immediately show the `CrisisSupport` component, never any path/simulation content.
- Enter a completely ordinary scenario ("Should I switch majors?") → should proceed normally to profile collection.
- Check your server console (`npm run dev` terminal) — if Supabase isn't configured yet, you should see a `[CRISIS EVENT — not persisted...]` warning logged for any flagged input. Once Supabase is configured, check the `crisis_events` table in the Supabase dashboard instead.
- Test a follow-up answer and a chat message containing crisis language too — both should trigger the same safety flow, not just the initial scenario field.

**Profile + follow-up:**
- Try submitting the profile form with an invalid email or missing fields → should show inline validation errors, not submit.
- Complete the profile → should show 3 adaptive follow-up questions tailored to your scenario.

**Flowchart + email:**
- After getting results, the flowchart should render above the path cards.
- Click "Email me this plan" — if `RESEND_API_KEY` isn't set, you should see "Email delivery isn't set up yet" rather than an error. Once configured, check the inbox of the email you entered.

**History:**
- Run a couple of simulations, then visit `/history`.
- Without Supabase configured, you should see your past scenarios pulled from `localStorage`.
- With Supabase configured, history should instead come from the database (the page tries the database first, by email lookup, then falls back).

**Tone safeguard:**
- This is mostly a backstop and hard to trigger manually since the system prompt already steers the model — no specific test needed beyond normal usage. If you ever see oddly generic/fallback text like "Let's look at this from a different angle," that means the safeguard caught something and replaced it.

## 7. Known limitations to mention if asked during judging

- History and profile work locally without auth — there's no login, so "your" history is tied to your browser (or, once Supabase is connected, looked up by email rather than a real authenticated session). Real multi-device sync would need Supabase Auth wired in (not done here, flagged as a future improvement).
- Crisis keyword list is a starting point, not exhaustive — the AI confirmation layer is there specifically to catch what the keyword list misses, but no detector is perfect.
- Email sandbox sender (if you don't verify your own domain) may land in spam folders.
