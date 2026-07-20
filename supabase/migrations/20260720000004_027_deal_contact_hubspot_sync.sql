/*
# Deal contact fields + HubSpot sync tracking

HubSpot is the official quote-generation tool — this app configures the deal, then "Push to
HubSpot" needs to hand over everything HubSpot needs to build the real customer-facing quote:
contact details, itemized products, deal stage, and action items left. Today's push_deal only
sends a bare deal name and one aggregate dollar amount (no line items, no contact name/phone, no
stage, nothing persisted about what was pushed) — this migration adds the fields the rebuilt
integration needs.

1. Contact fields on deals — this app has never had anywhere to store who the buyer actually is
   beyond a one-off email typed into the push modal each time (not persisted). Adding real fields
   so contact details survive between pushes and edits.

2. hubspot_deal_id / hubspot_contact_id — without these, every "Push to HubSpot" click would
   create a brand new HubSpot deal/contact rather than updating the one already pushed, silently
   duplicating records in a real CRM every time someone re-syncs after editing a quote. Storing
   the returned HubSpot IDs on first push makes every push after that an update-in-place.

`deals.stage` already exists (text, unused — every row has it null) and is reused as the internal
deal-stage value the push maps to a real HubSpot pipeline stage ID; no new column needed for that.
`deals.notes` already exists and is reused as the "action items / what's left" field pushed as a
HubSpot Note.
*/

ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS contact_first_name text,
  ADD COLUMN IF NOT EXISTS contact_last_name text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS hubspot_deal_id text,
  ADD COLUMN IF NOT EXISTS hubspot_contact_id text;

CREATE INDEX IF NOT EXISTS idx_deals_hubspot_deal_id ON deals(hubspot_deal_id) WHERE hubspot_deal_id IS NOT NULL;
