import { describe, expect, test } from "bun:test";

import { OpenAIChatCompletionsProvider } from "../chat-completions-provider.js";

type MockChunk = {
  choices: Array<{
    delta: {
      content?: string | null;
      tool_calls?: Array<{
        index: number;
        id?: string;
        type?: "function";
        function?: { name?: string; arguments?: string };
      }>;
    };
    finish_reason?: string | null;
  }>;
  usage?: { prompt_tokens: number; completion_tokens: number };
};

function stubProvider(chunks: MockChunk[]): OpenAIChatCompletionsProvider {
  const provider = new OpenAIChatCompletionsProvider("test-key", "test-model");
  (provider as unknown as { client: unknown }).client = {
    chat: {
      completions: {
        create: async () => ({
          async *[Symbol.asyncIterator]() {
            for (const c of chunks) {
              yield c;
            }
          },
        }),
      },
    },
  };
  return provider;
}

async function toolNames(chunks: MockChunk[]): Promise<string[]> {
  const response = await stubProvider(chunks).sendMessage([
    { role: "user", content: [{ type: "text", text: "hi" }] },
  ]);
  return response.content
    .filter((block) => block.type === "tool_use")
    .map((block) => (block as { name: string }).name);
}

describe("OpenAIChatCompletionsProvider streamed tool-call names", () => {
  test("ignores a gateway that repeats the full name on every delta", async () => {
    const names = await toolNames([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: "call_1", type: "function", function: { name: "bash", arguments: "" } },
              ],
            },
          },
        ],
      },
      {
        choices: [
          { delta: { tool_calls: [{ index: 0, function: { name: "bash", arguments: '{"command":' } }] } },
        ],
      },
      {
        choices: [
          { delta: { tool_calls: [{ index: 0, function: { name: "bash", arguments: '"ls"}' } }] }, finish_reason: "tool_calls" },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      },
    ]);
    expect(names).toEqual(["bash"]);
  });

  test("still joins a name that is split across deltas", async () => {
    const names = await toolNames([
      {
        choices: [
          {
            delta: {
              tool_calls: [
                { index: 0, id: "call_1", type: "function", function: { name: "web_", arguments: "" } },
              ],
            },
          },
        ],
      },
      {
        choices: [
          { delta: { tool_calls: [{ index: 0, function: { name: "search", arguments: "{}" } }] }, finish_reason: "tool_calls" },
        ],
        usage: { prompt_tokens: 1, completion_tokens: 1 },
      },
    ]);
    expect(names).toEqual(["web_search"]);
  });
});
