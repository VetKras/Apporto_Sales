import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const HUBSPOT_BASE = "https://api.hubapi.com";

// Read the HubSpot token from the database using the service role key so it
// is never returned to the browser — only this function ever sees it.
async function getHubSpotToken(): Promise<string | null> {
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data } = await supabase
    .from("integration_settings")
    .select("api_key")
    .eq("provider", "hubspot")
    .eq("is_active", true)
    .maybeSingle();
  return (data as { api_key: string | null } | null)?.api_key ?? null;
}

async function hubspotFetch(
  token: string,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<{ ok: boolean; status: number; data: unknown }> {
  const res = await fetch(`${HUBSPOT_BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

// Standard HubSpot-defined object pairs (deal<->contact, deal<->line_item, deal<->note) can be
// associated via this default-association shorthand without needing to know the numeric
// association type ID — HubSpot resolves it to whatever its own standard default is.
async function associateDefault(token: string, fromType: string, fromId: string, toType: string, toId: string) {
  await hubspotFetch(token, `/crm/v4/objects/${fromType}/${fromId}/associations/default/${toType}/${toId}`, "PUT");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { action, payload } = await req.json() as {
      action: "test_connection" | "push_deal" | "push_contact" | "get_pipeline_stages";
      payload?: Record<string, unknown>;
    };

    const token = await getHubSpotToken();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "HubSpot is not configured. Add your Private App token in Settings → Integrations." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── test_connection ────────────────────────────────────────────────────────
    if (action === "test_connection") {
      const result = await hubspotFetch(token, "/crm/v3/properties/contacts?limit=1");
      if (result.ok) {
        return new Response(
          JSON.stringify({ success: true, message: "HubSpot connection verified." }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: `HubSpot returned ${result.status}. Check your token.` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── get_pipeline_stages ────────────────────────────────────────────────────
    // Deal stages are pipeline-specific IDs configured per HubSpot account — fetched live rather
    // than hardcoded, so the "Push to HubSpot" stage picker always reflects the real pipeline.
    if (action === "get_pipeline_stages") {
      const result = await hubspotFetch(token, "/crm/v3/pipelines/deals");
      if (!result.ok) {
        return new Response(
          JSON.stringify({ error: `Failed to load HubSpot pipelines (${result.status}).` }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      const pipelines = (result.data as { results?: { id: string; label: string; stages: { id: string; label: string; displayOrder: number }[] }[] })?.results ?? [];
      const defaultPipeline = pipelines.find((p) => p.id === "default") ?? pipelines[0];
      const stages = (defaultPipeline?.stages ?? [])
        .slice()
        .sort((a, b) => a.displayOrder - b.displayOrder)
        .map((s) => ({ id: s.id, label: s.label }));
      return new Response(
        JSON.stringify({ success: true, pipelineId: defaultPipeline?.id ?? null, stages }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // ── push_deal ──────────────────────────────────────────────────────────────
    // Pushes everything HubSpot needs to generate the real customer-facing quote: deal (amount +
    // stage), contact, itemized line items (one per quote line — ad-hoc, not tied to a synced
    // HubSpot product catalog), and a Note carrying the rep's "what's left" text. If
    // existingHubspotDealId/existingHubspotContactId are provided (this internal deal has been
    // pushed before), updates those records in place instead of creating duplicates — the caller
    // is responsible for persisting the returned IDs back onto the internal deal row.
    if (action === "push_deal") {
      const {
        dealName, amount, dealStageId,
        contactEmail, contactFirstName, contactLastName, contactPhone,
        lineItems, notes,
        existingHubspotDealId, existingHubspotContactId,
      } = payload as {
        dealName: string;
        amount?: number;
        dealStageId?: string;
        contactEmail?: string;
        contactFirstName?: string;
        contactLastName?: string;
        contactPhone?: string;
        lineItems?: { name: string; quantity: number; price: number }[];
        notes?: string;
        existingHubspotDealId?: string;
        existingHubspotContactId?: string;
      };

      // 1. Create or update the deal
      const dealProps: Record<string, string | undefined> = {
        dealname: dealName,
        amount: amount != null ? String(amount) : undefined,
        pipeline: "default",
      };
      if (dealStageId) dealProps.dealstage = dealStageId;
      else if (!existingHubspotDealId) dealProps.dealstage = "appointmentscheduled";

      const dealRes = existingHubspotDealId
        ? await hubspotFetch(token, `/crm/v3/objects/deals/${existingHubspotDealId}`, "PATCH", { properties: dealProps })
        : await hubspotFetch(token, "/crm/v3/objects/deals", "POST", { properties: dealProps });

      if (!dealRes.ok) {
        const msg = (dealRes.data as { message?: string })?.message ?? `HubSpot error ${dealRes.status}`;
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const dealId = (dealRes.data as { id: string }).id;
      let contactId: string | null = existingHubspotContactId ?? null;

      // 2. Create/update contact and associate
      if (contactEmail) {
        if (!contactId) {
          const searchRes = await hubspotFetch(token, "/crm/v3/objects/contacts/search", "POST", {
            filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: contactEmail }] }],
            properties: ["email", "firstname", "lastname"],
            limit: 1,
          });
          if (searchRes.ok) {
            const results = (searchRes.data as { results?: { id: string }[] })?.results ?? [];
            if (results.length > 0) contactId = results[0].id;
          }
        }

        const contactProps = {
          email: contactEmail,
          firstname: contactFirstName ?? "",
          lastname: contactLastName ?? "",
          phone: contactPhone ?? "",
        };

        if (contactId) {
          await hubspotFetch(token, `/crm/v3/objects/contacts/${contactId}`, "PATCH", { properties: contactProps });
        } else {
          const contactRes = await hubspotFetch(token, "/crm/v3/objects/contacts", "POST", { properties: contactProps });
          if (contactRes.ok) contactId = (contactRes.data as { id: string }).id;
        }

        if (contactId) {
          await hubspotFetch(
            token,
            `/crm/v4/objects/contacts/${contactId}/associations/deals/${dealId}`,
            "PUT",
            [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 5 }],
          );
        }
      }

      // 3. Line items — on an update, clear out whatever was pushed last time and recreate from
      // the current quote, rather than trying to diff/reconcile individual rows.
      if (existingHubspotDealId) {
        const existingRes = await hubspotFetch(token, `/crm/v4/objects/deals/${existingHubspotDealId}/associations/line_items`);
        const existingIds = ((existingRes.data as { results?: { toObjectId: string }[] })?.results ?? []).map((r) => r.toObjectId);
        for (const id of existingIds) {
          await hubspotFetch(token, `/crm/v3/objects/line_items/${id}`, "DELETE");
        }
      }
      for (const item of lineItems ?? []) {
        const liRes = await hubspotFetch(token, "/crm/v3/objects/line_items", "POST", {
          properties: {
            name: item.name,
            quantity: String(item.quantity),
            price: String(item.price),
          },
        });
        if (liRes.ok) {
          const lineItemId = (liRes.data as { id: string }).id;
          await associateDefault(token, "line_items", lineItemId, "deals", dealId);
        }
      }

      // 4. Note — "what's left" / action items, visible on the deal timeline in HubSpot.
      if (notes && notes.trim()) {
        const noteRes = await hubspotFetch(token, "/crm/v3/objects/notes", "POST", {
          properties: {
            hs_note_body: notes,
            hs_timestamp: Date.now(),
          },
        });
        if (noteRes.ok) {
          const noteId = (noteRes.data as { id: string }).id;
          await associateDefault(token, "notes", noteId, "deals", dealId);
          if (contactId) await associateDefault(token, "notes", noteId, "contacts", contactId);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          dealId,
          contactId,
          wasUpdate: !!existingHubspotDealId,
          hubspotUrl: `https://app.hubspot.com/contacts/deals/${dealId}`,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}` }),
      { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
