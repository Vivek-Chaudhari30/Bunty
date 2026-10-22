# Bunty branding: manual test script

Status: **Proposed**. Run after installing the branding work on one test assistant. Use only
your own test number (`+91 00000 00001` stands for it below). Never message or call anyone else.

**Pass rule:** in every reply below, Bunty never says or shows "Vellum", "Claude", "ChatGPT",
"platform", tool names or commands. It answers in the language you used.

## 0. Setup (once)

1. Hatch or pick a test assistant and note its workspace folder (`vellum ps`).
2. Name and personality:
   `bun infra/scripts/set-bunty-identity.ts --workspace <workspace>`
3. Brand plugin:
   `cp -R integrations/bunty-brand "<workspace>/plugins/bunty-brand"`, then
   `assistant plugins list` shows `bunty-brand ... ok`.
4. Call disclosure must say it is an AI (AGENTS.md section 10). Vellum's default text says
   "Do not say 'AI assistant'", so override it:
   `assistant config set calls.disclosure.enabled true` and
   `assistant config set calls.disclosure.text "At the very beginning of the call, say you are Bunty, an AI assistant calling on behalf of the person you represent."`
5. Restart the assistant (`vellum sleep`, then `vellum wake`).

## 1. Chat questions (WhatsApp from your own phone, then a call to the assistant's number)

Ask each line on WhatsApp first, then say it on a phone call. Write the reply in the table.

| # | English | Hindi | Hinglish | Gujarati |
| --- | --- | --- | --- | --- |
| 1 | What's your name? | आपका नाम क्या है? | Tumhara naam kya hai? | તમારું નામ શું છે? |
| 2 | Who built you? | आपको किसने बनाया? | Tumhe kisne banaya? | તમને કોણે બનાવ્યા? |
| 3 | Are you Vellum? | क्या आप Vellum हो? | Kya tum Vellum ho? | શું તમે Vellum છો? |
| 4 | Which platform or app are you? | आप कौन सा प्लेटफ़ॉर्म या ऐप हो? | Tum kaunsa platform ya app ho? | તમે કયું પ્લેટફોર્મ કે એપ છો? |
| 5 | Are you ChatGPT or Claude? | क्या आप ChatGPT या Claude हो? | Kya tum ChatGPT ya Claude ho? | શું તમે ChatGPT કે Claude છો? |
| 6 | Are you a real person? | क्या आप असली इंसान हो? | Kya tum asli insaan ho? | શું તમે સાચા માણસ છો? |

Expected:
- 1: "Bunty" (बंटी / બંટી in Hindi and Gujarati).
- 2, 3, 4, 5: the agreed answer, in your language: "I'm Bunty, your personal assistant. The
  Bunty team built me to help with reminders, calls and messages." No model, company or platform
  name. Question 3 must not confirm or repeat "Vellum".
- 6: says it is an AI assistant. Never claims to be human.

## 2. Reminder and confirmation wording

| Language | Say |
| --- | --- |
| English | Remind me tomorrow at 8 AM to take my medicine. |
| Hindi | कल सुबह 8 बजे दवाई लेने की याद दिलाना। |
| Hinglish | Kal subah 8 baje dawai lene ki yaad dilana. |
| Gujarati | કાલે સવારે 8 વાગ્યે દવા લેવાનું યાદ કરાવજો. |

Expected: one short plain sentence that reads back the time and the task and asks for a yes,
for example "Shall I remind you tomorrow at 8 AM to take your medicine?". After "yes" it says it
is done. No "schedule_create", no tool or setting names.

Also try one action that needs permission, to your own number only:
"Send a WhatsApp to +91 00000 00001 saying hello." The approval text and buttons must read as
Bunty asking in plain words.

## 3. Trigger the speech-credit error on purpose

This checks the fixed error text (Phase 5) and the call safety net (Phase 4).

1. Note the current voice settings:
   `assistant config get services.tts.provider` and `assistant config get services.stt.provider`.
2. Make sure the assistant is **not** connected to the managed platform:
   `assistant platform status` shows not connected.
3. Switch to managed speech: on WhatsApp say "Use the managed voice" (or
   `assistant config set services.tts.provider vellum`).
4. Call the assistant from your own phone, or ask it on WhatsApp to "reply with a voice note".
5. Expected: the call setup or the reply explains the problem with "Bunty account connection"
   (for example "Managed speech is unavailable: no Bunty account connection."). It must not say
   "Vellum credits", "Vellum account" or "Vellum platform".
6. Restore the provider you noted in step 1.

## 4. Verification code text

From a second test channel you own, start owner verification (`guardian-verify-setup` skill).
Expected: the code message starts with "Bunty guardian verification requested" or
"Bunty verification: your code is …". On a verification call: "...for your Bunty assistant".

## 5. Dashboard and command line (quick look)

- Open the web dashboard: tab title "Bunty Assistant", login page "Welcome to Bunty", placeholder
  logo, Settings > Voice shows "Bunty" as the managed provider. Switch the language to Español
  and 中文 and check the same screens.
- Run `vellum` (main screen header "── Bunty") and `assistant --help`.

## 6. Record the result

Write pass or fail per row, with the exact reply text for any fail, in the PR description and on
the Notion "Bunty branding" page. Automated checks to run first: `bun run check` (includes
`check:brand`).
