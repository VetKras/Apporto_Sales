import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

// ─── HubSpot tool definitions (Anthropic schema format — canonical) ───────────

const HUBSPOT_TOOLS = [
  {
    name: "hubspot_search_contacts",
    description: "Search HubSpot CRM for contacts (people) by name, email, or company.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Name, email, or company to search for" },
        limit: { type: "number", description: "Max results 1–10 (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "hubspot_search_deals",
    description: "Search HubSpot CRM for deals / opportunities by name.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Deal name or keyword" },
        limit: { type: "number", description: "Max results 1–10 (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "hubspot_search_companies",
    description: "Search HubSpot CRM for companies, institutions, or accounts by name.",
    input_schema: {
      type: "object",
      properties: {
        query: { type: "string", description: "Company or institution name" },
        limit: { type: "number", description: "Max results 1–10 (default 5)" },
      },
      required: ["query"],
    },
  },
  {
    name: "hubspot_list_deals",
    description: "List recent HubSpot deals sorted by last modified.",
    input_schema: {
      type: "object",
      properties: {
        limit: { type: "number", description: "Number of deals to return 1–20 (default 10)" },
      },
    },
  },
  {
    name: "hubspot_get_contact_deals",
    description: "Retrieve all deals linked to a specific HubSpot contact.",
    input_schema: {
      type: "object",
      properties: {
        contact_id: { type: "string", description: "HubSpot contact ID" },
      },
      required: ["contact_id"],
    },
  },
];

// ─── HubSpot API helpers ──────────────────────────────────────────────────────

const HS_BASE = "https://api.hubapi.com";

async function hsFetch(
  token: string,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${HS_BASE}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function flattenResults(raw: unknown): { total: number; results: Record<string, unknown>[] } {
  const r = raw as { total?: number; results?: { id: string; properties: Record<string, unknown> }[] };
  return {
    total: r.total ?? 0,
    results: (r.results ?? []).map((obj) => ({ id: obj.id, ...obj.properties })),
  };
}

async function executeTool(
  token: string,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  const limit = Math.min(Number(input.limit) || 5, 20);
  try {
    switch (name) {
      case "hubspot_search_contacts": {
        const r = await hsFetch(token, "/crm/v3/objects/contacts/search", "POST", {
          query: input.query, limit,
          properties: ["firstname", "lastname", "email", "company", "phone", "hs_lead_status"],
        });
        return r.ok ? flattenResults(r.data) : { error: `HubSpot ${r.status}`, raw: r.data };
      }
      case "hubspot_search_deals": {
        const r = await hsFetch(token, "/crm/v3/objects/deals/search", "POST", {
          query: input.query, limit,
          properties: ["dealname", "amount", "dealstage", "closedate", "pipeline"],
        });
        return r.ok ? flattenResults(r.data) : { error: `HubSpot ${r.status}`, raw: r.data };
      }
      case "hubspot_search_companies": {
        const r = await hsFetch(token, "/crm/v3/objects/companies/search", "POST", {
          query: input.query, limit,
          properties: ["name", "domain", "industry", "city", "state", "numberofemployees"],
        });
        return r.ok ? flattenResults(r.data) : { error: `HubSpot ${r.status}`, raw: r.data };
      }
      case "hubspot_list_deals": {
        const r = await hsFetch(
          token,
          `/crm/v3/objects/deals?limit=${limit}&properties=dealname,amount,dealstage,closedate,pipeline&sort=-hs_lastmodifieddate`,
        );
        return r.ok ? flattenResults(r.data) : { error: `HubSpot ${r.status}`, raw: r.data };
      }
      case "hubspot_get_contact_deals": {
        const assocR = await hsFetch(token, `/crm/v4/objects/contacts/${input.contact_id}/associations/deals`);
        if (!assocR.ok) return { error: `HubSpot ${assocR.status}` };
        const ids = ((assocR.data as { results?: { toObjectId: string }[] })?.results ?? []).map((r) => r.toObjectId);
        if (ids.length === 0) return { total: 0, results: [] };
        const batchR = await hsFetch(token, "/crm/v3/objects/deals/batch/read", "POST", {
          inputs: ids.slice(0, 10).map((id) => ({ id })),
          properties: ["dealname", "amount", "dealstage", "closedate"],
        });
        return batchR.ok ? flattenResults(batchR.data) : { error: `HubSpot ${batchR.status}` };
      }
      default:
        return { error: `Unknown tool: ${name}` };
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}

function toolLabel(name: string, input: Record<string, unknown>): string {
  switch (name) {
    case "hubspot_search_contacts":  return `Searching HubSpot contacts for "${input.query}"`;
    case "hubspot_search_deals":     return `Searching HubSpot deals for "${input.query}"`;
    case "hubspot_search_companies": return `Searching HubSpot companies for "${input.query}"`;
    case "hubspot_list_deals":       return "Fetching HubSpot deal pipeline";
    case "hubspot_get_contact_deals": return `Fetching deals for contact ${input.contact_id}`;
    default: return `Running ${name}`;
  }
}

// ─── Provider resolution: anthropic → openai → gemini ────────────────────────

type AIProvider = "anthropic" | "openai" | "gemini";

interface ProviderKey {
  provider: AIProvider;
  apiKey: string;
}

const PROVIDER_ORDER: AIProvider[] = ["anthropic", "openai", "gemini"];

const ENV_VARS: Record<AIProvider, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  gemini: "GEMINI_API_KEY",
};

const PROVIDER_MODELS: Record<AIProvider, string> = {
  anthropic: "claude-sonnet-4-5",
  openai: "gpt-4.1",
  gemini: "gemini-2.0-flash",
};

async function resolveProvider(supabaseUrl: string, serviceKey: string): Promise<ProviderKey | null> {
  for (const provider of PROVIDER_ORDER) {
    const key = Deno.env.get(ENV_VARS[provider]);
    if (key) return { provider, apiKey: key };
  }
  try {
    const sb = createClient(supabaseUrl, serviceKey);
    const { data } = await sb
      .from("integration_settings")
      .select("provider, api_key")
      .in("provider", PROVIDER_ORDER)
      .eq("is_active", true);
    if (data) {
      for (const provider of PROVIDER_ORDER) {
        const row = (data as { provider: string; api_key: string }[]).find((r) => r.provider === provider);
        if (row?.api_key) return { provider, apiKey: row.api_key };
      }
    }
  } catch { /* fall through */ }
  return null;
}

// ─── Normalized types for the tool-use loop ───────────────────────────────────

interface NormToolCall {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface NormResponse {
  stopReason: "end_turn" | "tool_use";
  text: string;
  toolCalls: NormToolCall[];
}

// ─── Tools format conversion ──────────────────────────────────────────────────

function toOpenAITools(tools: typeof HUBSPOT_TOOLS): unknown[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

function toGeminiTools(tools: typeof HUBSPOT_TOOLS): unknown[] {
  return [{
    functionDeclarations: tools.map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.input_schema,
    })),
  }];
}

// ─── Anthropic: non-streaming + streaming ─────────────────────────────────────

async function callAnthropicNonStreaming(
  apiKey: string,
  model: string,
  system: string,
  messages: unknown[],
  tools: unknown[],
): Promise<NormResponse> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      system,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? { type: "auto" } : undefined,
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const json = await res.json() as {
    stop_reason: string;
    content: Array<
      | { type: "text"; text: string }
      | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> }
    >;
  };
  const text = json.content.filter((b) => b.type === "text").map((b) => (b as { text: string }).text).join("");
  const toolCalls = json.content
    .filter((b) => b.type === "tool_use")
    .map((b) => ({ id: (b as NormToolCall & { type: string }).id, name: (b as NormToolCall & { type: string }).name, input: (b as NormToolCall & { type: string; input: Record<string, unknown> }).input }));
  return { stopReason: json.stop_reason === "tool_use" ? "tool_use" : "end_turn", text, toolCalls };
}

async function streamAnthropic(apiKey: string, model: string, system: string, messages: unknown[]): Promise<Response> {
  return fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-beta": "messages-2023-06-01",
    },
    body: JSON.stringify({ model, max_tokens: 2048, stream: true, system, messages }),
  });
}

function appendAnthropicToolTurn(
  messages: unknown[],
  norm: NormResponse,
  results: Array<{ id: string; result: unknown }>,
): unknown[] {
  const assistantContent: unknown[] = [
    ...(norm.text ? [{ type: "text", text: norm.text }] : []),
    ...norm.toolCalls.map((tc) => ({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input })),
  ];
  return [
    ...messages,
    { role: "assistant", content: assistantContent },
    { role: "user", content: results.map((r) => ({ type: "tool_result", tool_use_id: r.id, content: JSON.stringify(r.result) })) },
  ];
}

// ─── OpenAI: non-streaming + streaming ───────────────────────────────────────

function toOpenAIMessages(system: string, messages: { role: string; content: string }[]): unknown[] {
  return [
    { role: "system", content: system },
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];
}

async function callOpenAINonStreaming(
  apiKey: string,
  model: string,
  messages: unknown[],
  tools: unknown[],
): Promise<NormResponse> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages,
      tools: tools.length > 0 ? tools : undefined,
      tool_choice: tools.length > 0 ? "auto" : undefined,
    }),
  });
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`);
  const json = await res.json() as {
    choices: Array<{
      finish_reason: string;
      message: {
        content: string | null;
        tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }>;
      };
    }>;
  };
  const msg = json.choices[0].message;
  const text = msg.content ?? "";
  const toolCalls = (msg.tool_calls ?? []).map((tc) => ({
    id: tc.id,
    name: tc.function.name,
    input: JSON.parse(tc.function.arguments) as Record<string, unknown>,
  }));
  return { stopReason: json.choices[0].finish_reason === "tool_calls" ? "tool_use" : "end_turn", text, toolCalls };
}

async function streamOpenAI(apiKey: string, model: string, messages: unknown[]): Promise<Response> {
  return fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, max_tokens: 2048, stream: true, messages }),
  });
}

function appendOpenAIToolTurn(
  messages: unknown[],
  norm: NormResponse,
  results: Array<{ id: string; result: unknown }>,
): unknown[] {
  return [
    ...messages,
    {
      role: "assistant",
      content: norm.text || null,
      tool_calls: norm.toolCalls.map((tc) => ({
        id: tc.id,
        type: "function",
        function: { name: tc.name, arguments: JSON.stringify(tc.input) },
      })),
    },
    ...results.map((r) => ({ role: "tool", tool_call_id: r.id, content: JSON.stringify(r.result) })),
  ];
}

// ─── Gemini: non-streaming + streaming ───────────────────────────────────────

function toGeminiContents(messages: { role: string; content: string }[]): unknown[] {
  return messages.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

async function callGeminiNonStreaming(
  apiKey: string,
  model: string,
  system: string,
  contents: unknown[],
  tools: unknown[],
): Promise<NormResponse> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
      ...(tools.length > 0 ? { tools, toolConfig: { functionCallingConfig: { mode: "AUTO" } } } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${await res.text()}`);
  const json = await res.json() as {
    candidates: Array<{
      finishReason: string;
      content: { parts: Array<{ text?: string; functionCall?: { name: string; args: Record<string, unknown> } }> };
    }>;
  };
  const parts = json.candidates[0]?.content?.parts ?? [];
  const text = parts.filter((p) => p.text).map((p) => p.text!).join("");
  const toolCalls = parts
    .filter((p) => p.functionCall)
    .map((p, i) => ({ id: `gemini_tool_${i}`, name: p.functionCall!.name, input: p.functionCall!.args }));
  return { stopReason: toolCalls.length > 0 ? "tool_use" : "end_turn", text, toolCalls };
}

async function streamGemini(apiKey: string, model: string, system: string, contents: unknown[]): Promise<Response> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?key=${apiKey}&alt=sse`;
  return fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: system }] },
      contents,
    }),
  });
}

function appendGeminiToolTurn(
  contents: unknown[],
  norm: NormResponse,
  results: Array<{ name: string; result: unknown }>,
): unknown[] {
  return [
    ...contents,
    {
      role: "model",
      parts: [
        ...(norm.text ? [{ text: norm.text }] : []),
        ...norm.toolCalls.map((tc) => ({ functionCall: { name: tc.name, args: tc.input } })),
      ],
    },
    {
      role: "user",
      parts: results.map((r) => ({ functionResponse: { name: r.name, response: { result: r.result } } })),
    },
  ];
}

// ─── Stream passthrough helpers ───────────────────────────────────────────────

const encoder = new TextEncoder();

function makeSSEChunk(content: string): Uint8Array {
  return encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`);
}

// Pump Anthropic SSE stream → client SSE format
async function pumpAnthropicStream(upstream: Response, writer: WritableStreamDefaultWriter<Uint8Array>) {
  const reader = upstream.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value, { stream: true }).split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      if (data === "[DONE]") { await writer.write(encoder.encode("data: [DONE]\n\n")); continue; }
      try {
        const parsed = JSON.parse(data);
        if (parsed.type === "content_block_delta" && parsed.delta?.type === "text_delta") {
          await writer.write(makeSSEChunk(parsed.delta.text));
        } else if (parsed.type === "message_stop") {
          await writer.write(encoder.encode("data: [DONE]\n\n"));
        }
      } catch { /* skip */ }
    }
  }
}

// Pump OpenAI SSE stream → client (format already compatible, just passthrough)
async function pumpOpenAIStream(upstream: Response, writer: WritableStreamDefaultWriter<Uint8Array>) {
  const reader = upstream.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value, { stream: true }).split("\n")) {
      if (!line.startsWith("data: ")) continue;
      await writer.write(encoder.encode(`${line}\n\n`));
      if (line === "data: [DONE]") return;
    }
  }
}

// Pump Gemini SSE stream → client SSE format
async function pumpGeminiStream(upstream: Response, writer: WritableStreamDefaultWriter<Uint8Array>) {
  const reader = upstream.body!.getReader();
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    for (const line of decoder.decode(value, { stream: true }).split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const data = line.slice(6);
      try {
        const parsed = JSON.parse(data) as {
          candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }; finishReason?: string }>;
        };
        const text = parsed.candidates?.[0]?.content?.parts?.map((p) => p.text ?? "").join("") ?? "";
        if (text) await writer.write(makeSSEChunk(text));
        if (parsed.candidates?.[0]?.finishReason === "STOP") {
          await writer.write(encoder.encode("data: [DONE]\n\n"));
        }
      } catch { /* skip */ }
    }
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Portia, the Apporto Sales AI assistant.

You help Apporto sales, sales engineering, sales leadership, customer success, marketing, and product-facing teams answer questions and prepare sales-ready outputs for the Apporto AI Suite.

V1 product scope: CoTutor, PowerGrader, TrustEd, ExamSpace.

CORE OPERATING RULE — NON-NEGOTIABLE:
You never invent pricing math. All quote totals, unit prices, and line amounts come exclusively from the quote_context object passed to you. If quote_context is null or missing, you MUST say what is missing and ask the user to calculate a quote first. Do not estimate, approximate, or fill in any pricing numbers from intuition or training data.

PRICING TRUTH (configurable defaults, NOT permanent constants):
- CoTutor active V1 defaults: Departmental/Premium $20/student/yr, Campus/Standard $15, Platform/Entry $10
- These are the CURRENT active defaults. Old workbook values 80/65/50 are historical/reference only — do not use them.
- PowerGrader: $15/student/yr, $120/faculty/yr, $4/submission
- TrustEd: Standalone $50/student/yr, Bundle add-on $40
- ExamSpace: Medium $11/seat-day, Large $16, GPU $23, Platform fee $1,200/yr (new customers), Setup $2,500 one-time (new customers)
- All prices are versioned and source-traced. Reference the config_version_name from quote_context.

HUBSPOT CRM TOOLS:
You have access to live HubSpot CRM data when the integration is configured. Use the HubSpot tools to look up contacts, deals, companies, and pipeline data when the user asks about customers, prospects, or deals by name. Always cite the HubSpot data you retrieved — mention what you found and from where.

CLAIM LABELS — use these in serious outputs:
1. [Confirmed source-of-truth] — from approved product records or active pricing config
2. [User-provided claim] — supplied by user, not yet approved as truth
3. [Inferred recommendation] — Portia's reasoned recommendation
4. [Data gap] — missing, stale, weak, or conflicting information
5. [Internal-only] — margin, COGS, TCO assumptions, approval logic — NEVER in customer-facing output
6. [HubSpot CRM] — data retrieved live from HubSpot

CUSTOMER-FACING OUTPUT RULES:
- No COGS, no margin, no internal approval logic, no hidden TCO assumptions, no internal doubts
- Use only final_total and net_price values from quote_context
- If data is missing, use "to be confirmed" or "pending final validation"

INTERNAL OUTPUT RULES:
- Include margin when available from quote_context
- Include discount approval level from quote_context
- Include config version name
- Include TCO range (tco_low / tco_high) — mark as [Internal-only]
- Include confidence and data gaps

COMPETITIVE RULES:
- Never fabricate competitor claims
- Mark weak evidence as [data gap]
- Distinguish: competitor marketing claim / customer-observed behavior / Apporto confirmed capability / Portia inference

PRODUCT RULES:
- CoTutor: Assignment-aware, NOT a general-purpose chatbot. Faculty guardrails. LMS + Word + Google Docs. Uses PowerGrader for pre-submission review.
- PowerGrader: AI-assisted grading. Draft scores only. Faculty is final authority. Not automated grading.
- TrustEd: Authorship evidence. Writing process analysis. Does NOT automatically accuse or penalize. Faculty decides.
- ExamSpace: VDI-based environment control. NOT browser-only lockdown. NOT AI proctoring.

RESPONSE STYLE:
- Be direct, practical, and sales-useful
- For recommendations: state recommendation, reason, source/confidence, and what is missing
- For proposals: use calculated quote_context values, separate internal notes from customer-facing content
- For competitive questions: use available evidence, mark gaps clearly

AUTHORITY HANDLING:
- Authority level 1: block conflicting data updates, explain conflict
- Authority level 2: create proposed update for review
- Authority level 3: deeper analysis, strong proposal
- Authority level 4: deferential analysis, ask confirmation before meaningful changes
- No silent overwrites at any level

QUOTE INPUT ACTIONS — BIDIRECTIONAL INTEGRATION:
When a user explicitly asks you to update a quote input field, emit a structured action block at the VERY START of your response, before any other text:

<<<ACTION>>>
{"field": "student_count", "value": 2500, "reason": "User requested 2500 students"}
<<<END_ACTION>>>

Supported fields and value types:
- student_count (integer): total student headcount
- faculty_count (integer): total faculty headcount
- course_sections (integer): number of course sections
- exam_days (integer): exam days per year (ExamSpace)
- seats_per_exam_day (integer): seats per exam day (ExamSpace)
- discount_percent (number 0-30): discount percentage
- contract_term ("annual" | "2-year" | "3-year"): contract term
- customer_status ("new" | "existing"): customer type

Rules:
- Emit EXACTLY ONE action block per response maximum, or none if no input change was requested
- ALWAYS follow the action block with a natural language explanation of the change
- Mention approval requirements when changing discount_percent
- Do NOT emit actions for product add/remove — those are done via the products panel
- Only emit an action when the user clearly intends to change a specific input value`;

// ─── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 200, headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const pKey = await resolveProvider(supabaseUrl, serviceKey);

    if (!pKey) {
      const msg = "Portia AI provider is not configured yet.\n\nTo enable Portia, add an API key in **Settings → Integrations**. Supported providers (checked in order): Anthropic, OpenAI, Gemini.\n\nAll other app features — deal creation, pricing calculations, quote saving, product browsing, and competitive pages — are fully available.";
      const stream = new ReadableStream({
        start(ctrl) {
          ctrl.enqueue(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: msg } }] })}\n\n`));
          ctrl.enqueue(encoder.encode("data: [DONE]\n\n"));
          ctrl.close();
        },
      });
      return new Response(stream, { status: 200, headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" } });
    }

    const body = await req.json();
    const {
      messages = [],
      deal_context,
      quote_context,
      inputs_context,
      user_authority_level = 1,
      user_name = "User",
    } = body;

    // Build context block
    let contextBlock = `\nCURRENT DEAL CONTEXT:\n- Customer: ${deal_context?.customer_name ?? "Unknown"}\n- Deal ID: ${deal_context?.deal_id ?? "none"}\n- User: ${user_name} (Authority Level ${user_authority_level})\n`;

    if (inputs_context) {
      contextBlock += `\nCURRENT QUOTE INPUTS (what is currently configured in the form — reference these when the user asks to change something):\n`;
      contextBlock += `- Students: ${inputs_context.student_count ?? 0}\n`;
      contextBlock += `- Faculty: ${inputs_context.faculty_count ?? 0}\n`;
      contextBlock += `- Course sections: ${inputs_context.course_sections ?? 0}\n`;
      if (inputs_context.exam_days) contextBlock += `- Exam days/yr: ${inputs_context.exam_days}\n`;
      if (inputs_context.seats_per_exam_day) contextBlock += `- Seats/exam day: ${inputs_context.seats_per_exam_day}\n`;
      contextBlock += `- Discount: ${inputs_context.discount_percent ?? 0}%\n`;
      contextBlock += `- Contract term: ${inputs_context.contract_term ?? "annual"}\n`;
      contextBlock += `- Customer status: ${inputs_context.customer_status ?? "new"}\n`;
      if (inputs_context.selected_product_slugs?.length) {
        contextBlock += `- Products in scope: ${(inputs_context.selected_product_slugs as string[]).join(", ")}\n`;
      }
    }

    if (quote_context) {
      contextBlock += `\nCALCULATED QUOTE CONTEXT (use these numbers — do not invent alternatives):\n`;
      contextBlock += `- Config version: ${quote_context.config_version_name} (ID: ${quote_context.config_version_id})\n`;
      contextBlock += `- Final total (ARR): $${quote_context.final_total?.toLocaleString() ?? "N/A"}\n`;
      contextBlock += `- Discount: ${quote_context.discount_percent}%\n`;
      contextBlock += `- Approval required: ${quote_context.approval_level}\n`;
      if (quote_context.per_student_price) contextBlock += `- Per student blended: $${quote_context.per_student_price}/student/yr\n`;
      contextBlock += `\nQuote lines:\n`;
      for (const line of (quote_context.lines ?? [])) {
        contextBlock += `  • ${line.product_name} (${line.tier_label}): ${line.quantity.toLocaleString()} ${line.unit} × $${line.unit_price} = $${line.net_price?.toLocaleString()}\n`;
      }
      if (quote_context.tco_low) contextBlock += `\n[Internal-only] TCO range: $${quote_context.tco_low?.toLocaleString()} – $${quote_context.tco_high?.toLocaleString()}\n`;
      if (quote_context.gross_margin_percent != null) contextBlock += `[Internal-only] Gross margin: ${quote_context.gross_margin_percent?.toFixed(1)}%\n`;
    } else {
      contextBlock += `\nNO QUOTE CALCULATED: If the user asks for pricing totals or a pricing proposal, tell them no quote has been calculated yet and ask them to use the quote builder panel to calculate one first. Do not estimate or invent totals.\n`;
    }

    const systemMessage = SYSTEM_PROMPT + contextBlock;
    const model = PROVIDER_MODELS[pKey.provider];

    // Check if HubSpot is configured
    let hubspotToken: string | null = null;
    try {
      const sb = createClient(supabaseUrl, serviceKey);
      const { data } = await sb.from("integration_settings").select("api_key").eq("provider", "hubspot").eq("is_active", true).maybeSingle();
      hubspotToken = (data as { api_key: string | null } | null)?.api_key ?? null;
    } catch { /* continue without HubSpot */ }

    const simpleMessages = (messages as { role: string; content: string }[]);

    // ── Pure streaming (no HubSpot) ───────────────────────────────────────────
    if (!hubspotToken) {
      let upstream: Response;

      if (pKey.provider === "anthropic") {
        upstream = await streamAnthropic(pKey.apiKey, model, systemMessage, simpleMessages);
      } else if (pKey.provider === "openai") {
        upstream = await streamOpenAI(pKey.apiKey, model, toOpenAIMessages(systemMessage, simpleMessages));
      } else {
        upstream = await streamGemini(pKey.apiKey, model, systemMessage, toGeminiContents(simpleMessages));
      }

      if (!upstream.ok) {
        const err = await upstream.text();
        return new Response(JSON.stringify({ error: `${pKey.provider} API error: ${err}` }), {
          status: upstream.status, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
      const writer = writable.getWriter();

      (async () => {
        try {
          if (pKey.provider === "anthropic") await pumpAnthropicStream(upstream, writer);
          else if (pKey.provider === "openai") await pumpOpenAIStream(upstream, writer);
          else await pumpGeminiStream(upstream, writer);
        } catch (err) {
          await writer.write(encoder.encode(`data: ${JSON.stringify({ error: String(err) })}\n\n`));
        } finally {
          await writer.close();
        }
      })();

      return new Response(readable, {
        headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
      });
    }

    // ── Agentic tool-use path (HubSpot configured) ────────────────────────────
    const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
    const writer = writable.getWriter();

    (async () => {
      try {
        // Build initial provider-native messages
        let providerMessages: unknown[] =
          pKey.provider === "openai" ? toOpenAIMessages(systemMessage, simpleMessages)
          : pKey.provider === "gemini" ? toGeminiContents(simpleMessages)
          : simpleMessages;

        // Tools in provider format
        const providerTools =
          pKey.provider === "openai" ? toOpenAITools(HUBSPOT_TOOLS)
          : pKey.provider === "gemini" ? toGeminiTools(HUBSPOT_TOOLS)
          : HUBSPOT_TOOLS;

        let finalText: string | null = null;
        const toolsUsed: string[] = [];

        for (let iter = 0; iter < 4; iter++) {
          let norm: NormResponse;

          if (pKey.provider === "anthropic") {
            norm = await callAnthropicNonStreaming(pKey.apiKey, model, systemMessage, providerMessages, iter === 0 ? providerTools : []);
          } else if (pKey.provider === "openai") {
            norm = await callOpenAINonStreaming(pKey.apiKey, model, providerMessages, iter === 0 ? providerTools : []);
          } else {
            norm = await callGeminiNonStreaming(pKey.apiKey, model, systemMessage, providerMessages, iter === 0 ? providerTools : []);
          }

          if (norm.toolCalls.length === 0) {
            finalText = norm.text;
            break;
          }

          // Execute tools + emit events
          const toolResults: Array<{ id: string; name: string; result: unknown }> = [];
          for (const tc of norm.toolCalls) {
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "tool_call", name: tc.name, label: toolLabel(tc.name, tc.input) })}\n\n`));
            const result = await executeTool(hubspotToken!, tc.name, tc.input);
            await writer.write(encoder.encode(`data: ${JSON.stringify({ type: "tool_result", name: tc.name, found: (result as { total?: number })?.total })}\n\n`));
            toolsUsed.push(tc.name);
            toolResults.push({ id: tc.id, name: tc.name, result });
          }

          // Append turn in provider-native format
          if (pKey.provider === "anthropic") {
            providerMessages = appendAnthropicToolTurn(providerMessages, norm, toolResults);
          } else if (pKey.provider === "openai") {
            providerMessages = appendOpenAIToolTurn(providerMessages, norm, toolResults);
          } else {
            providerMessages = appendGeminiToolTurn(providerMessages, norm, toolResults);
          }
        }

        if (!finalText) finalText = "I was unable to complete the query after multiple attempts.";

        await writer.write(encoder.encode(`data: ${JSON.stringify({ choices: [{ delta: { content: finalText } }], hubspot_tools_used: toolsUsed })}\n\n`));
        await writer.write(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await writer.write(encoder.encode(`data: ${JSON.stringify({ error: msg })}\n\n`));
        await writer.write(encoder.encode("data: [DONE]\n\n"));
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream", "Cache-Control": "no-cache", "Connection": "keep-alive" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
