// Checks that an AICredits key works for what Bunty needs from a model: the model exists,
// the key has credit, plain replies, Hindi/Hinglish, tool calls and streaming.
// Reads AICREDITS_API_KEY (and optional AICREDITS_BASE_URL, AICREDITS_MODEL) from the
// environment; Bun loads the repo's .env automatically when run from the repo root.
// Never prints the key. Exit code 1 if any check fails.
//
//   bun infra/scripts/check-aicredits.ts

const key = process.env.AICREDITS_API_KEY?.trim();
const baseUrl = (process.env.AICREDITS_BASE_URL?.trim() || "https://api.aicredits.in/v1").replace(/\/+$/, "");
const model = process.env.AICREDITS_MODEL?.trim() || "openai/gpt-6-luna";
const effort = process.env.AICREDITS_REASONING_EFFORT?.trim() || "none";
const origin = new URL(baseUrl).origin;

if (!key) {
  console.error("AICREDITS_API_KEY is empty. Paste your key into .env (see .env.example) and run again.");
  process.exit(1);
}

type Check = { name: string; ok: boolean; detail: string };
const results: Check[] = [];
const auth = { Authorization: `Bearer ${key}`, "Content-Type": "application/json" };

async function check(name: string, fn: () => Promise<string>): Promise<void> {
  try {
    results.push({ name, ok: true, detail: await fn() });
  } catch (err) {
    results.push({ name, ok: false, detail: err instanceof Error ? err.message : String(err) });
  }
}

async function chat(body: Record<string, unknown>): Promise<{ json: any; ms: number }> {
  const started = performance.now();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: auth,
    // Luna is a reasoning model: hidden reasoning tokens count against max_tokens and add
    // seconds of latency. "none" answers in about 1.6 s instead of about 5 s.
    body: JSON.stringify({ model, reasoning_effort: effort, ...body }),
  });
  const ms = Math.round(performance.now() - started);
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return { json: JSON.parse(text), ms };
}

function usage(json: any): string {
  const u = json.usage ?? {};
  return `${u.prompt_tokens ?? "?"} in / ${u.completion_tokens ?? "?"} out tokens`;
}

await check("model is listed", async () => {
  const res = await fetch(`${origin}/api/models`);
  if (!res.ok) throw new Error(`HTTP ${res.status} from /api/models`);
  const body = await res.text();
  if (!body.includes(`"${model}"`)) throw new Error(`${model} not found in the public model list`);
  return `${model} is available`;
});

await check("key and credit balance", async () => {
  // The docs list /v1/credits, but the live endpoint is /api/credits.
  const res = await fetch(`${origin}/api/credits`, { headers: auth });
  const text = await res.text();
  if (res.status === 401 || res.status === 403) throw new Error(`key rejected (HTTP ${res.status})`);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  const credits = JSON.parse(text).data?.credits_inr;
  return `key accepted; balance ₹${typeof credits === "number" ? credits.toFixed(2) : "unknown"}`;
});

await check("plain reply", async () => {
  const { json, ms } = await chat({ messages: [{ role: "user", content: "Reply with exactly: OK" }], max_tokens: 20 });
  const reply = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!reply) throw new Error("empty reply");
  return `"${reply.slice(0, 60)}" in ${ms} ms, ${usage(json)}`;
});

await check("Hindi / Hinglish", async () => {
  const { json, ms } = await chat({
    messages: [
      { role: "system", content: "You are Bunty, a helpful phone assistant. Reply in the user's language, one short sentence." },
      { role: "user", content: "Kal subah 7 baje mujhe dawai ki yaad dilana." },
    ],
    max_tokens: 80,
  });
  const reply = json.choices?.[0]?.message?.content?.trim() ?? "";
  if (!reply) throw new Error("empty reply");
  return `"${reply.slice(0, 120)}" in ${ms} ms`;
});

await check("tool calling", async () => {
  const { json, ms } = await chat({
    messages: [{ role: "user", content: "Remind me tomorrow at 7 AM to take my medicine." }],
    tools: [
      {
        type: "function",
        function: {
          name: "set_reminder",
          description: "Create a reminder for the user.",
          parameters: {
            type: "object",
            properties: {
              text: { type: "string", description: "What to remind about" },
              when: { type: "string", description: "When, in plain words or ISO 8601" },
            },
            required: ["text", "when"],
          },
        },
      },
    ],
    tool_choice: "auto",
    max_tokens: 200,
  });
  const call = json.choices?.[0]?.message?.tool_calls?.[0];
  if (!call) throw new Error(`no tool call returned (finish_reason: ${json.choices?.[0]?.finish_reason})`);
  if (call.function?.name !== "set_reminder") throw new Error(`called ${call.function?.name} instead of set_reminder`);
  const args = JSON.parse(call.function.arguments ?? "{}");
  return `set_reminder(${JSON.stringify(args)}) in ${ms} ms`;
});

await check("streaming", async () => {
  const started = performance.now();
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ model, stream: true, messages: [{ role: "user", content: "Count from 1 to 5." }], max_tokens: 40 }),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let firstTokenMs: number | null = null;
  let chunks = 0;
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:") || line.includes("[DONE]")) continue;
      const delta = JSON.parse(line.slice(5)).choices?.[0]?.delta?.content;
      if (delta) {
        chunks++;
        firstTokenMs ??= Math.round(performance.now() - started);
      }
    }
  }
  if (!chunks) throw new Error("no streamed text received");
  return `${chunks} chunks, first token after ${firstTokenMs} ms`;
});

console.log(`AICredits check: ${baseUrl}, model ${model}\n`);
for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}: ${r.detail}`);
const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
