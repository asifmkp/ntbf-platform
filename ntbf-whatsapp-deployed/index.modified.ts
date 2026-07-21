// NTBF WhatsApp bot — Stage 5: confirmed orders PUSH into the platform's staff queue.
// After save_order, the bot POSTs the order to the platform's ingest endpoint
// (PLATFORM_INGEST_URL, auth via PLATFORM_INGEST_TOKEN secret). The platform re-prices
// server-side and returns ORD-#### which we store on the wa_order. If the token isn't
// set yet or the push fails, the order still saves locally and the customer flow is
// unaffected (push_status records what happened for later retry).
//
// Stage 6 (DRAFT): reminder opt-in consent.
//   - After a genuinely saved order, if the phone has NO opt_ins row, we offer reminder
//     opt-in via interactive reply buttons (routed on stable button IDs, not titles).
//   - A set_opt_in tool lets Claude record a CLEAR verbal yes/no.
//   - Inbound STOP / إيقاف always unsubscribes (active=false), regardless of Claude.
//   - Consent uses the EXISTING opt_ins schema: active(bool)=opted-in, consent_by(text)=how.
//   - Cron reminder sender is now config-driven and passes the template's required
//     variables (skips + logs instead of ever sending a malformed template call).
const D360_API_KEY = Deno.env.get("D360_API_KEY") ?? "";
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
const ANTHROPIC_MODEL = Deno.env.get("ANTHROPIC_MODEL") ?? "claude-sonnet-4-6";
const VERIFY_TOKEN = Deno.env.get("WHATSAPP_VERIFY_TOKEN") ?? "";
const CATALOG_URL = Deno.env.get("CATALOG_URL") ?? "https://app.ntbfllc.com/mobile-app/catalog.js";
const CATALOG_URL_FALLBACK = "https://app.ntbfllc.com/order/catalog.js";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const PLATFORM_INGEST_URL = Deno.env.get("PLATFORM_INGEST_URL") ?? "https://app.ntbfllc.com/api/portal/orders/ingest";
const PLATFORM_INGEST_TOKEN = Deno.env.get("PLATFORM_INGEST_TOKEN") ?? "";
const D360_MESSAGES_URL = "https://waba-v2.360dialog.io/messages";
const D360_TEMPLATES_URL = "https://waba-v2.360dialog.io/v1/configs/templates";
const REST = `${SUPABASE_URL}/rest/v1`;
const H = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

function jsonResponse(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", "cache-control": "no-store" },
  });
}

// ---------------- settings ----------------
let SETTINGS: Record<string, string> = {};
let SETTINGS_AT = 0;
async function settings(): Promise<Record<string, string>> {
  if (Object.keys(SETTINGS).length && Date.now() - SETTINGS_AT < 5 * 60 * 1000) return SETTINGS;
  const res = await fetch(`${REST}/bot_settings?select=key,value`, { headers: H });
  if (res.ok) {
    const rows: { key: string; value: string }[] = await res.json();
    SETTINGS = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    SETTINGS_AT = Date.now();
  }
  return SETTINGS;
}

// ---------------- memory ----------------
type ChatRow = { role: "user" | "assistant"; content: string };
async function recordInbound(phone: string, content: string, waId: string, name?: string): Promise<boolean> {
  const res = await fetch(`${REST}/wa_messages?on_conflict=wa_id`, {
    method: "POST", headers: { ...H, Prefer: "resolution=ignore-duplicates,return=representation" },
    body: JSON.stringify([{ phone, role: "user", content, wa_id: waId, customer_name: name ?? null }]),
  });
  if (!res.ok) { console.error("recordInbound:", res.status, await res.text()); return true; }
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}
async function recordReply(phone: string, content: string): Promise<void> {
  const res = await fetch(`${REST}/wa_messages`, {
    method: "POST", headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify([{ phone, role: "assistant", content }]),
  });
  if (!res.ok) console.error("recordReply:", res.status, await res.text());
}
async function loadHistory(phone: string): Promise<ChatRow[]> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const url = `${REST}/wa_messages?phone=eq.${encodeURIComponent(phone)}&created_at=gte.${encodeURIComponent(since)}&order=created_at.desc&limit=12&select=role,content`;
  const res = await fetch(url, { headers: H });
  if (!res.ok) return [];
  const rows: ChatRow[] = await res.json();
  rows.reverse();
  const merged: ChatRow[] = [];
  for (const r of rows) {
    const last = merged[merged.length - 1];
    if (last && last.role === r.role) last.content += "\n" + r.content;
    else merged.push({ role: r.role, content: r.content });
  }
  while (merged.length && merged[0].role !== "user") merged.shift();
  return merged;
}

// ---------------- opt-ins (reminder consent) ----------------
// Consent lives in the EXISTING opt_ins table (no schema change):
//   active (bool)     -> opted-in flag (column defaults true; we always pass it EXPLICITLY)
//   consent_by (text) -> how the consent was captured
//   name (text)       -> the customer name, reused as {{1}} in reminders
// Rule: we NEVER re-ask a phone that already has ANY opt_ins row.
const STOP_WORDS = new Set(["stop", "unsubscribe", "إيقاف", "ايقاف"]);
function isStopKeyword(text: string): boolean {
  return STOP_WORDS.has(text.trim().toLowerCase());
}
async function upsertOptIn(phone: string, name: string | undefined, active: boolean, consentBy: string): Promise<void> {
  // active passed EXPLICITLY so a "No thanks" / STOP reliably stores false (not the true default).
  const res = await fetch(`${REST}/opt_ins?on_conflict=phone`, {
    method: "POST", headers: { ...H, Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify([{ phone, name: name ?? null, consent_by: consentBy, active }]),
  });
  if (!res.ok) console.error("upsertOptIn:", res.status, await res.text());
  else console.log(`opt_in ${phone} active=${active} by=${consentBy}`);
}
async function hasOptInRow(phone: string): Promise<boolean> {
  const res = await fetch(`${REST}/opt_ins?phone=eq.${encodeURIComponent(phone)}&select=phone&limit=1`, { headers: H });
  if (!res.ok) { console.error("hasOptInRow:", res.status); return true; } // fail-safe: assume exists -> don't re-ask
  const rows = await res.json().catch(() => []);
  return Array.isArray(rows) && rows.length > 0;
}
async function sendOptInButtons(to: string): Promise<void> {
  const res = await fetch(D360_MESSAGES_URL, {
    method: "POST", headers: { "D360-API-KEY": D360_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp", recipient_type: "individual", to, type: "interactive",
      interactive: {
        type: "button",
        body: { text: "Would you like a friendly WhatsApp reminder when it's time to reorder? Reply STOP anytime to unsubscribe." },
        action: { buttons: [
          { type: "reply", reply: { id: "optin_yes", title: "Yes, remind me" } },
          { type: "reply", reply: { id: "optin_no", title: "No thanks" } },
        ] },
      },
    }),
  });
  const r = await res.json().catch(() => ({}));
  if (!res.ok) console.error("optin buttons failed:", res.status, JSON.stringify(r));
}
async function maybeOfferReminderOptIn(phone: string, name?: string): Promise<void> {
  if (await hasOptInRow(phone)) { console.log(`opt_in: ${phone} already has a row, not asking`); return; }
  await sendOptInButtons(phone);
}
async function handleOptInButton(phone: string, name: string | undefined, yes: boolean): Promise<void> {
  await upsertOptIn(phone, name, yes, "post_order_buttons");
  await sendText(phone, yes
    ? "Great — we'll remind you when it's time to reorder. Reply STOP anytime to unsubscribe. 🙏"
    : "No problem — we won't send reminders. You can still order anytime by messaging us here.");
}
async function handleStop(phone: string, name?: string): Promise<void> {
  await upsertOptIn(phone, name, false, "stop_keyword");
  await sendText(phone, "You've been unsubscribed from reminders. You can still order anytime by messaging us here. 🙏");
}
async function setOptInFromTool(phone: string, name: string | undefined, input: any): Promise<string> {
  if (typeof input?.opted_in !== "boolean") return "OPT_IN_NOT_RECORDED: preference unclear, nothing saved.";
  await upsertOptIn(phone, name, input.opted_in, "verbal");
  return input.opted_in
    ? "OPT_IN_RECORDED: the customer will receive reorder reminders."
    : "OPT_IN_RECORDED: the customer will NOT receive reminders.";
}

// ---------------- platform push ----------------
async function pushToPlatform(waOrderId: number, phone: string, name: string | null, address: string, items: any[], total: number | null, note: string | null): Promise<{ status: string; platformId?: string; error?: string; needsReview?: boolean }> {
  if (!PLATFORM_INGEST_TOKEN) return { status: "skipped_no_token" };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(PLATFORM_INGEST_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-ingest-token": PLATFORM_INGEST_TOKEN },
      body: JSON.stringify({
        source: "whatsapp",
        external_ref: String(waOrderId),
        phone,
        customer_name: name ?? undefined,
        address,
        items: items.map((i: any) => ({ name: i.name, qty_cartons: i.qty_cartons, unit_price_aed: i.unit_price_aed, line_total_aed: i.line_total_aed })),
        total_aed: total ?? undefined,
        note: note ?? undefined,
      }),
      signal: ctrl.signal,
    });
    clearTimeout(t);
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.ok) {
      console.error("platform ingest failed:", res.status, JSON.stringify(j));
      return { status: "error", error: `HTTP ${res.status}: ${JSON.stringify(j).slice(0, 200)}` };
    }
    return { status: j.needsReview ? "needs_review" : "pushed", platformId: j.order_id, needsReview: !!j.needsReview };
  } catch (e) {
    console.error("platform ingest exception:", e);
    return { status: "error", error: (e as Error).message };
  }
}

// ---------------- orders ----------------
async function saveOrder(phone: string, name: string | undefined, input: any): Promise<string> {
  const items = Array.isArray(input?.items) ? input.items : [];
  if (items.length === 0) return "ORDER_NOT_SAVED: no items provided.";
  if (!input?.address || String(input.address).trim().length < 3) {
    return "ORDER_NOT_SAVED: delivery address missing. Ask the customer for their shop name and area (e.g. 'Al Ain Baqala, Al Muwaihat, Ajman') and then save again WITH the address.";
  }
  const address = String(input.address).trim();
  const custName = input?.customer_name ?? name ?? null;
  const total = typeof input?.total_aed === "number" ? input.total_aed : null;
  const note = input?.note ?? null;
  const res = await fetch(`${REST}/wa_orders`, {
    method: "POST", headers: { ...H, Prefer: "return=representation" },
    body: JSON.stringify([{ phone, customer_name: custName, items, total_aed: total, note, address }]),
  });
  if (!res.ok) { console.error("saveOrder:", res.status, await res.text()); return "ORDER_NOT_SAVED: internal error — tell the customer the team will still follow up."; }
  const rows = await res.json();
  const id = rows?.[0]?.id;
  console.log(`Order saved #${id} for ${phone}`);

  // Stage 5: push into the platform staff queue (non-blocking for the customer if it fails)
  const push = await pushToPlatform(id, phone, custName, address, items, total, note);
  await fetch(`${REST}/wa_orders?id=eq.${id}`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ push_status: push.status, platform_order_id: push.platformId ?? null, push_error: push.error ?? null }),
  }).catch(() => {});
  console.log(`Order #${id} push -> ${push.status} ${push.platformId ?? ""}`);

  return `ORDER_SAVED with reference number ${id}. Tell the customer their order #${id} is logged with delivery to their address, and the team will confirm it.`;
}

// ---------------- catalog ----------------
type Product = { name: string; unit: string; price: number | null };
let CATALOG: Product[] = [];
let CATALOG_AT = 0; let CATALOG_SRC = "none";
const TTL = 6 * 60 * 60 * 1000;
function num(v: unknown): number | null {
  const n = typeof v === "string" ? parseFloat(v) : typeof v === "number" ? v : NaN;
  return isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : null;
}
function mapItem(it: any): Product | null {
  if (!it || typeof it !== "object") return null;
  const name = it.name ?? it.item_name ?? it.title ?? it.product ?? null;
  if (!name || typeof name !== "string") return null;
  const price = num(it.price) ?? num(it.rate) ?? num(it.sellPrice) ?? num(it.sell_price) ?? num(it.salePrice) ?? num(it.sale_price) ?? num(it.sellingPrice) ?? null;
  const unit = (it.unit ?? it.pack ?? it.packing ?? it.packSize ?? it.pack_size ?? it.uom ?? "") + "";
  return { name: name.trim(), unit: unit.trim(), price };
}
function extractArrays(t: string): any[][] {
  const out: any[][] = []; let i = 0;
  while (i < t.length) {
    const s = t.indexOf("[", i); if (s === -1) break;
    let d = 0, j = s, q: string | null = null, e = false;
    for (; j < t.length; j++) {
      const c = t[j];
      if (q) { if (e) e = false; else if (c === "\\") e = true; else if (c === q) q = null; continue; }
      if (c === '"' || c === "'" || c === "`") { q = c; continue; }
      if (c === "[") d++; else if (c === "]") { d--; if (d === 0) break; }
    }
    if (d === 0 && j > s) {
      const chunk = t.slice(s, j + 1);
      if (chunk.length > 200) { try { const p = JSON.parse(chunk); if (Array.isArray(p) && p.length > 10) out.push(p); } catch { /* skip */ } }
      i = j + 1;
    } else i = s + 1;
  }
  out.sort((a, b) => b.length - a.length); return out;
}
async function loadCatalogFrom(url: string): Promise<Product[]> {
  const res = await fetch(url); if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  const text = await res.text();
  let cands: any[][] = [];
  try {
    const w = JSON.parse(text);
    if (Array.isArray(w)) cands.push(w);
    else if (w?.items) cands.push(w.items);
    else if (w?.products) cands.push(w.products);
  } catch { cands = extractArrays(text); }
  for (const a of cands) { const m = a.map(mapItem).filter((p): p is Product => !!p); if (m.length > 10) return m; }
  throw new Error(`no product array in ${url}`);
}
async function ensureCatalog(): Promise<void> {
  if (CATALOG.length && Date.now() - CATALOG_AT < TTL) return;
  for (const u of [CATALOG_URL, CATALOG_URL_FALLBACK]) {
    try { CATALOG = await loadCatalogFrom(u); CATALOG_AT = Date.now(); CATALOG_SRC = u; console.log(`Catalog: ${CATALOG.length} from ${u}`); return; }
    catch (e) { console.warn("catalog:", (e as Error).message); }
  }
  console.error("Catalog unavailable.");
}
function searchProducts(query: string): string {
  if (CATALOG.length === 0) return "CATALOG_UNAVAILABLE";
  const terms = query.toLowerCase().split(/[^a-z0-9ء-ي]+/).filter((t) => t.length > 1);
  if (!terms.length) return "No search terms.";
  const sc: { p: Product; s: number }[] = [];
  for (const p of CATALOG) {
    const hay = (p.name + " " + p.unit).toLowerCase();
    let s = 0; for (const t of terms) if (hay.includes(t)) s++;
    if (s > 0) sc.push({ p, s });
  }
  sc.sort((a, b) => b.s - a.s || (b.p.price ? 1 : 0) - (a.p.price ? 1 : 0) || a.p.name.localeCompare(b.p.name));
  const top = sc.slice(0, 12);
  if (!top.length) return `No products found matching "${query}".`;
  return `Found ${sc.length} matching product(s). Top results:\n` + top.map(({ p }) =>
    `- ${p.name}${p.unit ? " — " + p.unit : ""} — ${p.price ? `AED ${p.price.toFixed(2)}` : "price on request"}`).join("\n");
}

// ---------------- Claude ----------------
const SYSTEM_PROMPT = `You are the WhatsApp assistant for National Trading of Beverage and Foodstuff LLC (NTBF), a wholesale FMCG and beverage distributor based in Ajman, UAE. You chat with shop owners and retail customers. You see the recent conversation history — use it for follow-ups ("the second one", "make the bill").

BUSINESS FACTS:
- Address: Shop No: 02, Ajman Medical Center Building, Al Muwaihat, Ajman, UAE.
- Hours: 24/7, orders anytime. Delivery: our own team, all over the UAE, to the customer's shop.
- Contact: +971 58 980 0239 and +971 58 980 0237. App: https://app.ntbfllc.com/order/
- Payment: cash on delivery. No minimum order.

TOOLS:
- search_products: NTBF's real catalog (~1,400+ items). ALWAYS use it for product/brand/category/price questions; never guess. "price on request" means the team confirms the price — never invent one. Prices are per pack/carton in AED.
- save_order: when the customer CONFIRMS an order (items + quantities agreed), FIRST make sure you have their DELIVERY ADDRESS — shop name + area/emirate (e.g. "Star Baqala, Al Muwaihat, Ajman"). If you don't have it from this conversation, ask ONE short question for it before saving. Then call save_order with items AND address, tell them their order reference number, repeat the delivery address back, and say the team will confirm. Do not save an order the customer hasn't confirmed. One save per confirmed order — don't save duplicates.
- set_opt_in: record the customer's reminder preference ONLY when they clearly and explicitly state whether they want reorder reminders (e.g. "yes, send me reminders", "please stop reminders / don't remind me"). If the customer says nothing about reminders, or is ambiguous, DO NOT call this tool. Do NOT ask about reminders yourself — the system offers that automatically after an order.
- If search returns CATALOG_UNAVAILABLE, apologise briefly; team will confirm availability.

Rules:
- Friendly, professional, BRIEF. Plain text, no markdown/asterisks. Emojis in moderation. Greet only on the first message of a conversation.
- NEVER invent prices, discounts, stock or balances. Bulk pricing → sales team numbers above.
- No live stock or customer balances; offer to pass such questions to the team.
- Reply in the customer's language (English, Arabic, Hindi, Urdu, Malayalam etc.).
- If asked: yes, you're NTBF's automated assistant; a human reviews conversations.`;

const TOOLS = [
  { name: "search_products", description: "Search NTBF's live wholesale product catalog by name, brand, or category.", input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] } },
  {
    name: "save_order",
    description: "Save a customer's CONFIRMED order for the NTBF team to process. Only call when items, quantities AND delivery address are known.",
    input_schema: {
      type: "object",
      properties: {
        customer_name: { type: "string" },
        address: { type: "string", description: "Delivery address: shop name + area + emirate, as given by the customer" },
        items: { type: "array", items: { type: "object", properties: { name: { type: "string" }, qty_cartons: { type: "number" }, unit_price_aed: { type: "number" }, line_total_aed: { type: "number" } }, required: ["name", "qty_cartons"] } },
        total_aed: { type: "number" },
        note: { type: "string" },
      },
      required: ["items", "address"],
    },
  },
  {
    name: "set_opt_in",
    description: "Record the customer's reorder-reminder consent. Call ONLY when the customer CLEARLY and EXPLICITLY states a yes/no about receiving reminders. If they are ambiguous or silent about reminders, do NOT call this tool.",
    input_schema: {
      type: "object",
      properties: { opted_in: { type: "boolean", description: "true if the customer clearly wants reminders, false if they clearly refuse" } },
      required: ["opted_in"],
    },
  },
];

async function anthropicCall(system: string, messages: any[]): Promise<any> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "x-api-key": ANTHROPIC_API_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json" },
    body: JSON.stringify({ model: ANTHROPIC_MODEL, max_tokens: 700, system, tools: TOOLS, messages }),
  });
  if (!res.ok) { console.error(`Anthropic ${res.status}: ${await res.text()}`); throw new Error(`Anthropic ${res.status}`); }
  return await res.json();
}
async function askClaude(history: ChatRow[], phone: string, customerName?: string): Promise<{ text: string; savedOrder: boolean }> {
  const system = customerName ? `${SYSTEM_PROMPT}\n\nCustomer's WhatsApp profile name: ${customerName}` : SYSTEM_PROMPT;
  const messages: any[] = history.map((h) => ({ role: h.role, content: h.content }));
  let savedOrder = false;
  if (!messages.length) return { text: "Hi! Welcome to NTBF. How can I help you today?", savedOrder };
  for (let round = 0; round < 5; round++) {
    const data = await anthropicCall(system, messages);
    if (data.stop_reason === "tool_use") {
      const uses = (data.content ?? []).filter((b: any) => b.type === "tool_use");
      messages.push({ role: "assistant", content: data.content });
      const results = [];
      for (const tu of uses) {
        let out: string;
        if (tu.name === "search_products") { out = searchProducts(tu.input?.query ?? ""); console.log(`search("${tu.input?.query}")`); }
        else if (tu.name === "save_order") { out = await saveOrder(phone, customerName, tu.input); if (out.startsWith("ORDER_SAVED")) savedOrder = true; }
        else if (tu.name === "set_opt_in") { out = await setOptInFromTool(phone, customerName, tu.input); }
        else out = "Unknown tool.";
        results.push({ type: "tool_result", tool_use_id: tu.id, content: out });
      }
      messages.push({ role: "user", content: results });
      continue;
    }
    const text = (data.content ?? []).filter((b: any) => b.type === "text").map((b: any) => b.text).join("\n").trim();
    return { text: text || "Sorry, I couldn't process that. Our team will follow up with you.", savedOrder };
  }
  return { text: "Sorry, I couldn't complete that just now. Our team will follow up with you.", savedOrder };
}

// ---------------- WhatsApp ----------------
async function sendText(to: string, body: string): Promise<void> {
  const res = await fetch(D360_MESSAGES_URL, {
    method: "POST", headers: { "D360-API-KEY": D360_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { body } }),
  });
  const r = await res.json().catch(() => ({}));
  if (!res.ok) console.error("send failed:", res.status, JSON.stringify(r));
  else console.log("Sent:", r.messages?.[0]?.id ?? "(no id)");
}
// Config-driven reminder template send. Reads name/lang/highlights/coupon from bot_settings and
// supplies the template's REQUIRED variables. Returns {ok:false, skipped} (never sends a malformed
// call) when required params are missing.
//   {{1}} = customer name (fallback "there")   {{2}} = s.reminder_highlights (REQUIRED)
//   coupon button component only added when s.reminder_coupon is non-empty.
async function sendReminderTemplate(to: string, name: string | null, s: Record<string, string>): Promise<{ ok: boolean; skipped?: string; waMessageId?: string }> {
  const tmpl = (s.reminder_template ?? "").trim();
  const lang = (s.reminder_lang ?? "en").trim() || "en";
  const highlights = (s.reminder_highlights ?? "").trim();
  const coupon = (s.reminder_coupon ?? "").trim();
  if (!tmpl) return { ok: false, skipped: "no reminder_template" };
  if (!highlights) return { ok: false, skipped: "reminder_highlights empty" };
  const who = (name && name.trim()) ? name.trim() : "there";
  const components: any[] = [
    { type: "body", parameters: [{ type: "text", text: who }, { type: "text", text: highlights }] },
  ];
  // order_reminder's COPY_CODE button sits at button index 1 (index 0 is the static "Shop now" URL).
  if (coupon) {
    components.push({ type: "button", sub_type: "copy_code", index: "1", parameters: [{ type: "coupon_code", coupon_code: coupon }] });
  }
  const res = await fetch(D360_MESSAGES_URL, {
    method: "POST", headers: { "D360-API-KEY": D360_API_KEY, "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", to, type: "template", template: { name: tmpl, language: { code: lang }, components } }),
  });
  const r = await res.json().catch(() => ({}));
  if (!res.ok) { console.error(`template->${to}:`, res.status, JSON.stringify(r)); return { ok: false }; }
  return { ok: true, waMessageId: r.messages?.[0]?.id };
}
async function markAsRead(id: string): Promise<void> {
  await fetch(D360_MESSAGES_URL, {
    method: "POST", headers: { "D360-API-KEY": D360_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ messaging_product: "whatsapp", status: "read", message_id: id }),
  }).catch(() => {});
}
function inboundText(msg: any): string | null {
  if (msg.type === "text" && msg.text?.body) return msg.text.body;
  if (msg.type === "interactive") return msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? null;
  if (msg.type === "button" && msg.button?.text) return msg.button.text;
  return null;
}
async function handleMessage(msg: any, contacts: any[]): Promise<void> {
  const from = msg.from as string;
  const name = contacts?.find((c) => c.wa_id === from)?.profile?.name;
  console.log(`Inbound ${msg.type} from ${from} (${name ?? "?"})`);
  await markAsRead(msg.id);
  const text = inboundText(msg);
  if (!text) {
    await sendText(from, "Thanks for your message! Right now I can only read text messages. You can browse our products and order at https://app.ntbfllc.com/order/ or call us at +971 58 980 0239.");
    return;
  }
  const isNew = await recordInbound(from, text, msg.id, name);
  if (!isNew) { console.log("duplicate, skipping"); return; }

  // (b) Opt-in reply buttons — route on the STABLE button id, never the (localisable) title.
  const btnId = msg.type === "interactive" ? (msg.interactive?.button_reply?.id ?? null) : null;
  if (btnId === "optin_yes" || btnId === "optin_no") {
    await handleOptInButton(from, name, btnId === "optin_yes");
    return;
  }

  // (d) Hard STOP / إيقاف — unsubscribe regardless of what Claude would do.
  if (isStopKeyword(text)) {
    await handleStop(from, name);
    return;
  }

  try {
    await ensureCatalog();
    const history = await loadHistory(from);
    const { text: reply, savedOrder } = await askClaude(history, from, name);
    await sendText(from, reply);
    await recordReply(from, reply);
    // (a) After a genuinely saved order, offer reminder opt-in — but only if we've never asked this phone.
    if (savedOrder) await maybeOfferReminderOptIn(from, name);
  } catch (e) {
    console.error("reply failed:", e);
    await sendText(from, "Sorry, I'm having a technical issue right now. Our team will get back to you shortly. You can also browse and order at https://app.ntbfllc.com/order/ or call +971 58 980 0239.");
  }
}

// ---------------- reminders ----------------
// Per-customer frequency + engagement guard. Reminder sends are recorded in message_log
// (direction='out'); "did the customer engage" is read from wa_messages (inbound, role='user').
// We picked message_log over send_throttle because the 2-consecutive-ignored rule needs the
// last N *sends*, which a single last_sent_at row cannot express.
async function logReminderSend(phone: string, template: string, waMessageId?: string): Promise<void> {
  const res = await fetch(`${REST}/message_log`, {
    method: "POST", headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify([{ phone, direction: "out", template_name: template, wa_message_id: waMessageId ?? null, status: "sent" }]),
  });
  if (!res.ok) console.error("logReminderSend:", res.status, await res.text());
}
// Decides whether THIS customer may receive a reminder now.
//   within_gap      -> a reminder was sent < reminder_gap_days ago
//   paused_2_ignored-> the last 2 reminders were both sent with no inbound since -> pause until they message us
//   log_read_failed -> couldn't read history -> fail CLOSED (don't send) to avoid accidental spam
async function reminderGate(phone: string, gapDays: number): Promise<{ send: boolean; reason?: string }> {
  const sendsRes = await fetch(`${REST}/message_log?phone=eq.${encodeURIComponent(phone)}&direction=eq.out&order=created_at.desc&limit=2&select=created_at`, { headers: H });
  if (!sendsRes.ok) { console.error("reminderGate sends:", sendsRes.status); return { send: false, reason: "log_read_failed" }; }
  const sends: { created_at: string }[] = await sendsRes.json().catch(() => []);
  // 2 consecutive ignored -> pause. t2 = the 2nd-most-recent send; if there's no inbound since t2,
  // both of the last two reminders went unanswered. Any inbound after t2 breaks the streak (auto-resume).
  if (sends.length >= 2) {
    const t2 = Date.parse(sends[1].created_at);
    const inRes = await fetch(`${REST}/wa_messages?phone=eq.${encodeURIComponent(phone)}&role=eq.user&order=created_at.desc&limit=1&select=created_at`, { headers: H });
    const inn = inRes.ok ? await inRes.json().catch(() => []) : [];
    const lastIn = Array.isArray(inn) && inn.length ? Date.parse(inn[0].created_at) : 0;
    if (lastIn < t2) return { send: false, reason: "paused_2_ignored" };
  }
  // frequency gap since the most recent send
  if (sends.length >= 1) {
    const last = Date.parse(sends[0].created_at);
    if (Date.now() - last < gapDays * 24 * 60 * 60 * 1000) return { send: false, reason: "within_gap" };
  }
  return { send: true };
}
async function runReminders(): Promise<{ sent: number; failed: number; skipped: number; note?: string }> {
  const s = await settings();
  if ((s.reminders_enabled ?? "false") !== "true") return { sent: 0, failed: 0, skipped: 0, note: "reminders_enabled=false" };
  if (!(s.reminder_template ?? "").trim()) return { sent: 0, failed: 0, skipped: 0, note: "no reminder_template" };
  if (!(s.reminder_highlights ?? "").trim()) return { sent: 0, failed: 0, skipped: 0, note: "reminder_highlights empty — nothing sent" };
  const gapDays = parseInt(s.reminder_gap_days ?? "7", 10) || 7;
  const res = await fetch(`${REST}/opt_ins?active=eq.true&select=phone,name`, { headers: H });
  if (!res.ok) return { sent: 0, failed: 0, skipped: 0, note: "optin query failed" };
  const list: { phone: string; name: string | null }[] = await res.json();
  let sent = 0, failed = 0, skipped = 0;
  for (const o of list) {
    const gate = await reminderGate(o.phone, gapDays);
    if (!gate.send) { skipped++; console.log(`reminder skip ${o.phone}: ${gate.reason}`); continue; }
    const r = await sendReminderTemplate(o.phone, o.name, s);
    if (r.ok) { sent++; await logReminderSend(o.phone, (s.reminder_template ?? "").trim(), r.waMessageId); }
    else if (r.skipped) { skipped++; console.warn(`reminder skip ${o.phone}: ${r.skipped}`); }
    else failed++;
  }
  console.log(`Reminders: sent=${sent} failed=${failed} skipped=${skipped} of ${list.length} (gap=${gapDays}d)`);
  return { sent, failed, skipped };
}

// ---------------- data API ----------------
const STATUSES = ["new", "confirmed", "rejected", "done"] as const;
async function setOrderStatus(id: string, status: string): Promise<boolean> {
  if (!STATUSES.includes(status as any)) return false;
  const res = await fetch(`${REST}/wa_orders?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH", headers: { ...H, Prefer: "return=minimal" },
    body: JSON.stringify({ status }),
  });
  return res.ok;
}
async function dashboardData() {
  const s = await settings();
  const [msgsRes, ordRes, optRes] = await Promise.all([
    fetch(`${REST}/wa_messages?order=created_at.desc&limit=300&select=phone,role,content,customer_name,created_at`, { headers: H }),
    fetch(`${REST}/wa_orders?order=created_at.desc&limit=100`, { headers: H }),
    fetch(`${REST}/opt_ins?order=created_at.desc&limit=300`, { headers: H }),
  ]);
  return {
    generated_at: new Date().toISOString(),
    reminders: { enabled: (s.reminders_enabled ?? "false") === "true", template: s.reminder_template ?? "order_reminder", lang: s.reminder_lang ?? "en", highlights: s.reminder_highlights ?? "", coupon_set: !!(s.reminder_coupon ?? "").trim(), gap_days: parseInt(s.reminder_gap_days ?? "7", 10) || 7, schedule: "8:00 AM UAE daily" },
    orders: ordRes.ok ? await ordRes.json() : [],
    messages: msgsRes.ok ? await msgsRes.json() : [],
    opt_ins: optRes.ok ? await optRes.json() : [],
  };
}

// ---------------- server ----------------
Deno.serve(async (req) => {
  const url = new URL(req.url);
  const task = url.searchParams.get("task");

  if (task === "reminders") {
    const s = await settings();
    if (req.headers.get("x-cron-key") !== s.cron_key) return new Response("Forbidden", { status: 403 });
    return jsonResponse(await runReminders());
  }

  if (req.method === "GET") {
    const review = url.searchParams.get("review");
    if (review) {
      const s = await settings();
      if (review !== s.review_token) return jsonResponse({ error: "forbidden" }, 403);
      const orderId = url.searchParams.get("order_id");
      const setStatus = url.searchParams.get("set_status");
      if (orderId && setStatus) {
        const ok = await setOrderStatus(orderId, setStatus);
        return jsonResponse({ ok });
      }
      if (url.searchParams.get("health") === "templates") {
        try {
          const res = await fetch(D360_TEMPLATES_URL, { headers: { "D360-API-KEY": D360_API_KEY } });
          const j = await res.json().catch(() => ({}));
          const list = (j.waba_templates ?? j.templates ?? []).map((t: any) => ({ name: t.name, status: t.status, language: t.language, category: t.category }));
          return jsonResponse({ http: res.status, count: list.length, templates: list, raw: list.length ? undefined : j });
        } catch (e) {
          return jsonResponse({ error: (e as Error).message }, 500);
        }
      }
      return jsonResponse(await dashboardData());
    }
    if (url.searchParams.get("health") === "catalog") {
      await ensureCatalog();
      return jsonResponse({ items: CATALOG.length, source: CATALOG_SRC, sample: CATALOG.slice(0, 3) });
    }
    const mode = url.searchParams.get("hub.mode"), token = url.searchParams.get("hub.verify_token"), challenge = url.searchParams.get("hub.challenge");
    if (mode === "subscribe" && token && challenge) {
      if (VERIFY_TOKEN && token === VERIFY_TOKEN) return new Response(challenge, { status: 200 });
      return new Response("Forbidden", { status: 403 });
    }
    return new Response("NTBF WhatsApp bot is running", { status: 200 });
  }

  if (req.method === "POST") {
    const rawBody = await req.text();
    let payload: any;
    try { payload = JSON.parse(rawBody); } catch { return new Response("OK", { status: 200 }); }
    const tasks: Promise<void>[] = [];
    try {
      for (const entry of payload.entry ?? []) for (const change of entry.changes ?? []) {
        const value = change.value ?? {};
        for (const st of value.statuses ?? []) console.log(`Status: ${st.id} -> ${st.status}`);
        for (const msg of value.messages ?? []) tasks.push(handleMessage(msg, value.contacts ?? []));
      }
      if (!payload.entry && Array.isArray(payload.messages)) for (const msg of payload.messages) tasks.push(handleMessage(msg, payload.contacts ?? []));
    } catch (e) { console.error("payload error:", e); }
    if (tasks.length) {
      // @ts-ignore
      if (typeof EdgeRuntime !== "undefined" && EdgeRuntime.waitUntil) EdgeRuntime.waitUntil(Promise.allSettled(tasks));
      else Promise.allSettled(tasks);
    }
    return new Response("OK", { status: 200 });
  }

  return new Response("Method not allowed", { status: 405 });
});
