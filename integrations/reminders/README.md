# reminders

Reminders are **built into Vellum** (the bundled `schedule` skill and its `schedule_create`
tool). No plugin and no code: this folder is setup notes only. Phase 1.

## How it works

- "Remind me at 7 PM to call home" -> the model loads the `schedule` skill and calls
  `schedule_create` with `mode: "notify"` and a one-shot `fire_at`.
- `fire_at` **must** carry a time-zone offset (`2026-01-02T19:00:00+05:30`). Vellum refuses a
  bare time (`vellum/assistant/src/tools/schedule/create.ts`), so there is no host-clock guessing.
- Recurring reminders ("every weekday at 8:30") use a cron `expression` plus `timezone`
  (`Asia/Kolkata`, `Europe/London`, `America/New_York`).
- Only the owner (guardian) can create schedules. A contact asking for a reminder is refused.
- Where it is delivered: the owner's channels. Once WhatsApp is set up (Phase 2), reminders reach
  the owner there too.

## Setup (once per assistant)

1. Tell the assistant your time zone in plain words: "I live in Mumbai" (or London, Boston). It
   stores it in memory and uses it for `fire_at` and `timezone`.
2. Nothing else. No secrets.

## How to test (Phase 1 exit check)

Needs a running assistant (an Anthropic key). In `vellum client`:

1. India teammate: "remind me in 2 minutes to drink water". Check it fires within a minute of the
   time. Then "remind me at <time 3 minutes from now> IST to call home".
2. UK or US teammate: the same with their own zone ("at 9:05 PM London time").
3. "What reminders do I have?" then "cancel the water one" (`schedule_list`, `schedule_delete`).
4. Record the results (time asked, time fired, zone) in Notion.

Status: setup notes written; the live exit check needs an LLM key.
