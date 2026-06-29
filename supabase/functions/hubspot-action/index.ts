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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    const { action, payload } = await req.json() as {
      action: "test_connection" | "push_deal" | "push_contact";
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

    // ── push_deal ──────────────────────────────────────────────────────────────
    if (action === "push_deal") {
      const { dealName, amount, contactEmail, contactFirstName, contactLastName } =
        payload as {
          dealName: string;
          amount?: number;
          contactEmail?: string;
          contactFirstName?: string;
          contactLastName?: string;
        };

      // 1. Create the deal
      const dealRes = await hubspotFetch(token, "/crm/v3/objects/deals", "POST", {
        properties: {
          dealname: dealName,
          amount: amount != null ? String(amount) : undefined,
          dealstage: "appointmentscheduled",
          pipeline: "default",
        },
      });

      if (!dealRes.ok) {
        const msg = (dealRes.data as { message?: string })?.message ?? `HubSpot error ${dealRes.status}`;
        return new Response(
          JSON.stringify({ error: msg }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const dealId = (dealRes.data as { id: string }).id;
      let contactId: string | null = null;

      // 2. Optionally create/find contact and associate
      if (contactEmail) {
        // Try to find existing contact by email first
        const searchRes = await hubspotFetch(token, "/crm/v3/objects/contacts/search", "POST", {
          filterGroups: [{ filters: [{ propertyName: "email", operator: "EQ", value: contactEmail }] }],
          properties: ["email", "firstname", "lastname"],
          limit: 1,
        });

        if (searchRes.ok) {
          const results = (searchRes.data as { results?: { id: string }[] })?.results ?? [];
          if (results.length > 0) {
            contactId = results[0].id;
          }
        }

        // Create if not found
        if (!contactId) {
          const contactRes = await hubspotFetch(token, "/crm/v3/objects/contacts", "POST", {
            properties: {
              email: contactEmail,
              firstname: contactFirstName ?? "",
              lastname: contactLastName ?? "",
            },
          });
          if (contactRes.ok) {
            contactId = (contactRes.data as { id: string }).id;
          }
        }

        // Associate contact → deal
        if (contactId) {
          await hubspotFetch(
            token,
            `/crm/v4/objects/contacts/${contactId}/associations/deals/${dealId}`,
            "PUT",
            [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 5 }],
          );
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          dealId,
          contactId,
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
