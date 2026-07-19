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
    case "apporto_pricing_reference_query": return `Looking up pricing reference (${input.area})`;
    case "apporto_pipeline_query": return "Querying Apporto deal pipeline";
    default: return `Running ${name}`;
  }
}

// ─── Apporto internal tools (always available — no external config needed) ───

type SupabaseClient = ReturnType<typeof createClient>;

const APPORTO_TOOLS = [
  {
    name: "apporto_pricing_reference_query",
    description: "Look up current pricing assumptions and rate tables from the active pricing config version — CoTutor's business levers and technical usage assumptions, the approved CoTutor AI model rate table, or a product's tier prices/costs. Use this for questions about pricing RULES or ASSUMPTIONS in the abstract (margin, adoption rate, model rates, tier structure). Do NOT use this for a specific deal's calculated price — that always comes from quote_context instead, never from this tool.",
    input_schema: {
      type: "object",
      properties: {
        area: {
          type: "string",
          enum: ["cotutor_assumptions", "cotutor_models", "product_tiers"],
          description: "cotutor_assumptions = business levers + technical usage assumptions. cotutor_models = approved AI model rate table. product_tiers = a product's tier prices/costs.",
        },
        product_slug: {
          type: "string",
          enum: ["cotutor", "powergrader", "trusted", "examspace"],
          description: "Required when area is 'product_tiers'.",
        },
      },
      required: ["area"],
    },
  },
  {
    name: "apporto_pipeline_query",
    description: "Query Apporto's own deal pipeline (not HubSpot) — counts, stages, statuses, and latest quoted totals. Automatically scoped server-side to what the requesting user is allowed to see. Use for questions like 'how many contracts has the team closed' or 'what does <rep> have in pipeline.'",
    input_schema: {
      type: "object",
      properties: {
        rep_name: { type: "string", description: "Optional — filter to a specific rep by name. Still constrained by the requester's visibility scope; asking about someone outside your scope returns nothing, not an error that reveals they exist." },
        status: { type: "string", description: "Optional — filter by deal status (e.g. draft, active, closed_won, closed_lost)." },
      },
    },
  },
];

interface Requester {
  profileId: string | null;
  authorityLevel: number;
  isPrv: boolean;
  supervisorProfileId: string | null;
}

// Never trust client-sent authority/privilege claims for access decisions — only the caller's
// own id is trusted (same trust boundary as a session cookie). Everything else is looked up here.
async function resolveRequester(sb: SupabaseClient, profileId: string | null): Promise<Requester> {
  if (!profileId) return { profileId: null, authorityLevel: 1, isPrv: false, supervisorProfileId: null };
  const { data } = await sb
    .from("profiles")
    .select("authority_level, a43ac9, supervisor_profile_id")
    .eq("id", profileId)
    .maybeSingle();
  const row = data as { authority_level: number; a43ac9: boolean; supervisor_profile_id: string | null } | null;
  return {
    profileId,
    authorityLevel: row?.authority_level ?? 1,
    isPrv: row?.a43ac9 ?? false,
    supervisorProfileId: row?.supervisor_profile_id ?? null,
  };
}

async function canAccessDeal(sb: SupabaseClient, dealId: string, requester: Requester): Promise<boolean> {
  if (requester.isPrv || requester.authorityLevel >= 4) return true;
  const { data } = await sb.from("deals").select("owner_profile_id").eq("id", dealId).maybeSingle();
  const ownerId = (data as { owner_profile_id: string | null } | null)?.owner_profile_id;
  if (!ownerId || !requester.profileId) return false;
  if (ownerId === requester.profileId) return true;
  if (requester.authorityLevel === 3) {
    const { data: owner } = await sb.from("profiles").select("supervisor_profile_id").eq("id", ownerId).maybeSingle();
    return (owner as { supervisor_profile_id: string | null } | null)?.supervisor_profile_id === requester.profileId;
  }
  return false;
}

// STUB — the level-based feature-access system (feature_flags / feature_level_access /
// feature_team_restrictions) this reads from is a separate, not-yet-built plan
// (docs/FEATURE_ACCESS_CONTROL_PLAN.md). Until those tables exist, every feature reads as
// enabled for everyone — same as current (pre-this-feature) behavior. Replace this function's
// body with the real two-tier cascade lookup once that migration lands; the call site below
// doesn't need to change.
async function getEffectiveFeatureAccess(_sb: SupabaseClient, _requester: Requester): Promise<Record<string, boolean>> {
  return { competitive: true, portia: true, proposal_generation: true, battlecard_generation: true, strategy_generation: true };
}

async function getActivePricingConfigVersionId(sb: SupabaseClient): Promise<string | null> {
  const { data } = await sb.from("pricing_config_versions").select("id").eq("is_active", true).maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

async function executeApportoPricingQuery(sb: SupabaseClient, input: Record<string, unknown>): Promise<unknown> {
  const versionId = await getActivePricingConfigVersionId(sb);
  if (!versionId) return { error: "No active pricing config version found" };

  if (input.area === "cotutor_assumptions") {
    const { data, error } = await sb.from("cotutor_pricing_assumptions").select("*").eq("config_version_id", versionId).maybeSingle();
    return error ? { error: error.message } : data;
  }
  if (input.area === "cotutor_models") {
    const { data, error } = await sb.from("cotutor_ai_models").select("*").eq("config_version_id", versionId).order("sort_order");
    return error ? { error: error.message } : data;
  }
  if (input.area === "product_tiers") {
    const slug = String(input.product_slug || "");
    if (!slug) return { error: "product_slug is required for area='product_tiers'" };
    const { data, error } = await sb.from("pricing_models").select("*").eq("config_version_id", versionId).eq("product_id", `seed-product-${slug}`);
    return error ? { error: error.message } : data;
  }
  return { error: `Unknown area: ${input.area}` };
}

async function executeApportoPipelineQuery(sb: SupabaseClient, requester: Requester, input: Record<string, unknown>): Promise<unknown> {
  let ownerIds: string[] | null = null; // null = no restriction (L4 or _prv)
  let scopeLabel = "entire team";

  if (!requester.isPrv && requester.authorityLevel < 4) {
    if (requester.authorityLevel === 3 && requester.profileId) {
      const { data: reports } = await sb.from("profiles").select("id").eq("supervisor_profile_id", requester.profileId);
      ownerIds = [requester.profileId, ...((reports ?? []) as { id: string }[]).map((r) => r.id)];
      scopeLabel = "you + your direct reports";
    } else {
      ownerIds = requester.profileId ? [requester.profileId] : [];
      scopeLabel = "you only";
    }
  }

  let q = sb
    .from("deals")
    .select("id, customer_name, stage, status, owner_profile_id, profiles(name), quote_snapshots(final_total, created_at)")
    .order("updated_at", { ascending: false })
    .limit(50);
  if (ownerIds) q = q.in("owner_profile_id", ownerIds);
  if (input.status) q = q.eq("status", input.status as string);

  const { data, error } = await q;
  if (error) return { error: error.message };

  let rows = (data ?? []) as Array<{
    customer_name: string; stage: string | null; status: string;
    profiles: { name: string } | null; quote_snapshots: { final_total: number; created_at: string }[];
  }>;
  if (input.rep_name) {
    const needle = String(input.rep_name).toLowerCase();
    rows = rows.filter((d) => (d.profiles?.name ?? "").toLowerCase().includes(needle));
  }

  return {
    scope: scopeLabel,
    total: rows.length,
    deals: rows.map((d) => ({
      customer: d.customer_name,
      owner: d.profiles?.name ?? "unknown",
      stage: d.stage,
      status: d.status,
      latest_quote_total: [...d.quote_snapshots].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]?.final_total ?? null,
    })),
  };
}

async function executeApportoTool(
  sb: SupabaseClient,
  requester: Requester,
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  try {
    if (name === "apporto_pricing_reference_query") return await executeApportoPricingQuery(sb, input);
    if (name === "apporto_pipeline_query") return await executeApportoPipelineQuery(sb, requester, input);
    return { error: `Unknown tool: ${name}` };
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
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

type ToolDef = { name: string; description: string; input_schema: Record<string, unknown> };

function toOpenAITools(tools: ToolDef[]): unknown[] {
  return tools.map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.input_schema },
  }));
}

function toGeminiTools(tools: ToolDef[]): unknown[] {
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

// ─── SSE encoding ──────────────────────────────────────────────────────────────
// Tool-calling requires the non-streaming provider APIs (need the full response to see if a
// tool was requested), so responses are flushed once at the end rather than token-by-token.
// The three provider-native SSE passthrough pumps this file used to have (for a no-tools fast
// path) are gone along with the "pure streaming" branch they served — apporto_* tools are now
// always available, so that branch never runs anymore. See docs/pricing/05_PORTIA_AI.md.

const encoder = new TextEncoder();

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are Portia, the Apporto Sales AI assistant — voice inherited from Athena
(Apporto's analytics bot): calm, precise, evidence-led, never rushed, never speculative. You do not
say "it feels like," "let's stay optimistic," or project certainty on insufficient data — you name
the gap explicitly and say only what the evidence in front of you supports. Distinguish signal from
noise before naming a conclusion.

You help Apporto sales, sales engineering, sales leadership, customer success, marketing, and product-facing teams answer questions and prepare sales-ready outputs for the Apporto AI Suite.

V1 product scope: CoTutor, PowerGrader, TrustEd, ExamSpace.

Note: "Portia" here is this app's internal sales-copilot name only, chosen to keep the Apporto bot
theme — it is not the separate Portia product Apporto sells, and not the CoTutor tutoring product
students and faculty use. Its own AI usage runs on company API, not something priced out to customers.

CORE OPERATING RULE — NON-NEGOTIABLE:
You never invent pricing math. All quote totals, unit prices, and line amounts come exclusively from the quote_context object passed to you. If quote_context is null or missing, you MUST say what is missing and ask the user to calculate a quote first. Do not estimate, approximate, or fill in any pricing numbers from intuition or training data.

ACCESS: Whatever deal, quote, or competitive data appears in your context below is already scoped to what this user is allowed to see — that filtering happened server-side before you received it, you are not being asked to self-censor. If a DEAL ACCESS note below says access is restricted, say so plainly and do not attempt to reconstruct the missing data from general knowledge, prior turns, or inference — it was withheld on purpose.

PRICING DISCIPLINE (inherited from Jordan Pricing — apply when the conversation is about pricing, discounting, or deal structure):
- Every discount requires a named trade: term, volume, upfront payment, or scope. Never suggest a lower price without naming what's traded for it.
- When asked to recommend a price, present floor / target / anchor when quote_context supports it — not one soft number.
- Diagnose whether an objection is a price problem or a value-clarity problem before responding to it.
- CoTutor's AI cost pass-through (the token-COGS formula) is a structural line item — always read it from quote_context, never estimate it.
- Never imply approval of a discount that exceeds the deal's approval_level threshold from quote_context.

PRICING TRUTH:
- Never state a margin, rate, model list, or tier price from memory — Apporto's pricing has changed before and will change again. For a specific deal's calculated price, use quote_context (never invent it). For general questions about pricing rules, assumptions, margins, or rate tables, call apporto_pricing_reference_query — don't answer from training data or recall from earlier in this conversation if it might be stale.
- CoTutor pricing is formula-driven (token COGS ÷ (1 − target margin)), not flat tiers — if asked "what's the CoTutor price," ask for the deal's inputs (or read quote_context) rather than naming a number.
- If apporto_pricing_reference_query returns a row with confidence 'low', say so; don't present it with the same certainty as a verified rate.

COMPETITIVE DISCIPLINE (inherited from Domonic Competitive — apply when the conversation is about competitors or positioning):
- A single competitive_matrix row is a data point, not a pattern. Don't call something a structural risk or a safe position from one row of evidence.
- Ask what a competitor move implies, not just what it is — surface the strategic read from the row's positioning/edge/strategic_window fields, don't just recite them.
- Never reassure ("we're in a good position against them") without citing the specific competitive_matrix evidence behind it.
- When competitive_context is empty for the products in scope, say so plainly and point to the Competitive page rather than falling back on general impressions or training-data claims about competitors.

TOOLS AVAILABLE:
- apporto_pricing_reference_query — current pricing assumptions, AI model rate table, or product tier prices/costs from the active config version. Use for general pricing-rule questions, never for a specific deal's price.
- apporto_pipeline_query — Apporto's own deal pipeline (counts, stages, latest quoted totals), pre-scoped server-side to what you're allowed to see. Use for "how many deals," "what does X have in pipeline" type questions. If it returns a smaller result than expected, that's the user's actual visibility scope, not a bug — don't apologize for it or suggest a workaround.
- HubSpot tools (hubspot_search_contacts, hubspot_search_deals, hubspot_search_companies, hubspot_list_deals, hubspot_get_contact_deals) — live HubSpot CRM data, only available when the HubSpot integration is configured. Always cite what you found and from where.

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

PRODUCT RULES:
- CoTutor: Assignment-aware, NOT a general-purpose chatbot. Faculty guardrails. LMS + Word + Google Docs. Uses PowerGrader for pre-submission review.
- PowerGrader: AI-assisted grading. Draft scores only. Faculty is final authority. Not automated grading.
- TrustEd: Authorship evidence. Writing process analysis. Does NOT automatically accuse or penalize. Faculty decides.
- ExamSpace: VDI-based environment control. NOT browser-only lockdown. NOT AI proctoring.

RESPONSE STYLE:
- Athena's register: calm, precise, evidence-first. State the finding, then the evidence, then — if there's a clear next action — name it. No hedging, no manufactured optimism, no certainty beyond what the data supports.
- For recommendations: state recommendation, reason, source/confidence, and what is missing
- For proposals: use calculated quote_context values, separate internal notes from customer-facing content
- For competitive questions: apply Competitive Discipline above — pattern vs. data point, motive over description

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
      competitive_context,
      user_profile_id = null,
      user_authority_level = 1,
      user_name = "User",
    } = body;

    const sb = createClient(supabaseUrl, serviceKey);

    // Resolve real identity/privilege server-side from user_profile_id — never trust the
    // client-sent user_authority_level for access decisions (display copy only, see below).
    const requester = await resolveRequester(sb, user_profile_id);
    const features = await getEffectiveFeatureAccess(sb, requester);

    let dealAuthorized = true;
    if (deal_context?.deal_id) {
      dealAuthorized = await canAccessDeal(sb, deal_context.deal_id, requester);
    }

    // Build context block
    let contextBlock = `\nCURRENT DEAL CONTEXT:\n- Customer: ${deal_context?.customer_name ?? "Unknown"}\n- Deal ID: ${deal_context?.deal_id ?? "none"}\n- User: ${user_name} (Authority Level ${user_authority_level})\n`;

    if (!dealAuthorized) {
      contextBlock += `\nDEAL ACCESS: You do not have access to this deal's pricing/quote data at your authority level. Say so plainly if asked — do not attempt to answer from general knowledge.\n`;
    } else {
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
    }

    if (!features.competitive) {
      contextBlock += `\nCOMPETITIVE ACCESS: Competitive intelligence is disabled for this user. Do not discuss competitor positioning even if asked — say it's restricted and point to their manager/admin.\n`;
    } else if (dealAuthorized && competitive_context && competitive_context.length > 0) {
      contextBlock += `\nCOMPETITIVE CONTEXT (live competitive_matrix rows for the products in this deal — use this, don't guess at competitor positioning):\n`;
      for (const row of competitive_context as Array<{
        competitor: string; tier: string | null; escalation: string | null;
        positioning: string | null; strength: string | null; edge: string | null; strategic_window: string | null;
      }>) {
        contextBlock += `  • ${row.competitor} — threat tier: ${row.tier ?? "unset"}, escalation: ${row.escalation ?? "unset"}\n`;
        if (row.positioning) contextBlock += `    Sales positioning: ${row.positioning}\n`;
        if (row.strength) contextBlock += `    Competitor strength: ${row.strength}\n`;
        if (row.edge) contextBlock += `    Apporto edge: ${row.edge}\n`;
        if (row.strategic_window) contextBlock += `    Strategic window: ${row.strategic_window}\n`;
      }
    } else if (dealAuthorized) {
      contextBlock += `\nNO COMPETITIVE CONTEXT: No competitive_matrix rows are loaded for the products in this deal. If the user asks a competitive-positioning question, say so and suggest checking the Competitive page rather than inferring from training data.\n`;
    }

    const systemMessage = SYSTEM_PROMPT + contextBlock;
    const model = PROVIDER_MODELS[pKey.provider];

    // Check if HubSpot is configured
    let hubspotToken: string | null = null;
    try {
      const { data } = await sb.from("integration_settings").select("api_key").eq("provider", "hubspot").eq("is_active", true).maybeSingle();
      hubspotToken = (data as { api_key: string | null } | null)?.api_key ?? null;
    } catch { /* continue without HubSpot */ }

    const simpleMessages = (messages as { role: string; content: string }[]);

    // ── Agentic tool-use path — always on. apporto_* tools need no external config;
    // HubSpot tools are appended only when that integration is configured. ────────
    const allTools: ToolDef[] = [...APPORTO_TOOLS, ...(hubspotToken ? HUBSPOT_TOOLS : [])];

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
          pKey.provider === "openai" ? toOpenAITools(allTools)
          : pKey.provider === "gemini" ? toGeminiTools(allTools)
          : allTools;

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
            const result = tc.name.startsWith("apporto_")
              ? await executeApportoTool(sb, requester, tc.name, tc.input)
              : hubspotToken
              ? await executeTool(hubspotToken, tc.name, tc.input)
              : { error: "HubSpot is not configured." };
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
