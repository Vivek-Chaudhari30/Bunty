/**
 * Type-only shim for `@vellumai/plugin-api`, used by our root `tsconfig.json`.
 *
 * Inside a running assistant the real package is provided by Vellum. Here we
 * only need the few shapes our plugins use, so typechecking does not pull in
 * the whole Vellum source tree. Every declaration mirrors
 * `vellum/assistant/src/plugin-api/` (types.ts, store-credential.ts,
 * resolve-credential.ts, webhook-url.ts, conversation-turn.ts). If Vellum
 * changes one of these, update it here too.
 */
declare module "@vellumai/plugin-api" {
  export type RiskLevel = "low" | "medium" | "high";

  export interface ToolContext {
    conversationId: string;
    workingDir: string;
    requestId?: string;
    signal?: AbortSignal;
    assistantId?: string;
    /** "guardian" for the owner; other values for contacts and unknown senders. */
    trustClass: string;
    executionChannel?: string;
    forcePromptSideEffects?: boolean;
    requireFreshApproval?: boolean;
    /** True only when a human approved this exact call in the permission prompt. */
    approvedViaPrompt?: boolean;
    requesterExternalUserId?: string;
    requesterDisplayName?: string;
    toolUseId?: string;
  }

  export interface ToolExecutionResult {
    content: string;
    isError: boolean;
    status?: string;
    yieldToUser?: boolean;
  }

  export interface ToolDefinition {
    name?: string;
    description?: string;
    input_schema?: Record<string, unknown>;
    defaultRiskLevel?: RiskLevel;
    category?: string;
    executionTarget?: "sandbox" | "host";
    execute?: (
      input: Record<string, unknown>,
      ctx: ToolContext,
    ) => Promise<ToolExecutionResult>;
  }

  /** Pino-style logger (vellum/assistant/src/hooks/types.ts). */
  export interface PluginLogger {
    info(obj: Record<string, unknown>, msg?: string): void;
    warn(obj: Record<string, unknown>, msg?: string): void;
    error(obj: Record<string, unknown>, msg?: string): void;
    debug(obj: Record<string, unknown>, msg?: string): void;
  }

  export interface InitContext {
    config: unknown;
    logger: PluginLogger;
    pluginStorageDir: string;
    assistantVersion: string;
  }

  export interface ShutdownContext {
    assistantVersion: string;
  }

  /** vellum/assistant/src/hooks/types.ts PreModelCallContext. */
  export interface PreModelCallContext {
    readonly conversationId: string;
    /** "mainAgent" for the user-facing reply; null when the call site is untagged. */
    readonly callSite: string | null;
    systemPrompt: string | null;
    modelProfile: string | null;
    deferAssistantOutput: boolean;
    readonly logger: PluginLogger;
  }

  export interface StoreCredentialOptions {
    label?: string;
    description?: string;
    skipTranscriptScrub?: boolean;
  }
  export function storeCredential(
    ref: string,
    value: string,
    options?: StoreCredentialOptions,
  ): Promise<unknown>;
  export function resolveCredential(ref: string): Promise<string>;

  export interface WebhookUrlOptions {
    path: string;
    plugin?: string;
  }
  export function resolveWebhookUrl(options: WebhookUrlOptions): Promise<string>;

  export function getWorkspaceDir(): string;

  export interface TextContent {
    type: "text";
    text: string;
  }
  export interface ConversationChannelAddress {
    sourceChannel: string;
    externalChatId: string;
    externalUserId?: string | null;
    displayName?: string | null;
  }
  export interface RunConversationTurnOptions {
    conversationId?: string;
    channel?: ConversationChannelAddress;
    content: TextContent[];
    signal?: AbortSignal;
    conversationType?: "standard" | "background";
  }
  export interface RunConversationTurnResult {
    conversationId: string;
    userMessageId: string;
    queued?: boolean;
  }
  export function runConversationTurn(
    options: RunConversationTurnOptions,
  ): Promise<RunConversationTurnResult>;
}
