import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const GEMINI_KEY = Deno.env.get("GEMINI_API_KEY");

function json(o: unknown, status = 200): Response {
  return new Response(JSON.stringify(o), { status, headers: { "Content-Type": "application/json" } });
}

// Ask Gemini (with Google Search grounding) for the school's public iCal feed.
async function askGemini(school: string, domain: string): Promise<string[]> {
  if (!GEMINI_KEY) throw new Error("GEMINI_API_KEY is not set on this project");
  const prompt =
    `Find the PUBLIC events calendar iCal feed URL (ends in .ics, or a Localist / ` +
    `Google Calendar ICS export) for the university "${school}"` +
    (domain ? ` (email domain ${domain})` : "") +
    `. Many universities use Localist at events.<domain> which exposes an .ics ` +
    `export. Respond with ONLY the raw candidate URL(s), one per line, no prose.`;
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], tools: [{ google_search: {} }] }),
    },
  );
  const j = await res.json();
  const text: string = (j?.candidates?.[0]?.content?.parts ?? [])
    .map((p: { text?: string }) => p.text ?? "").join("\n");
  return Array.from(text.matchAll(/https?:\/\/[^\s"'<>]+/g)).map((m) => m[0]);
}

// A URL is only trusted after we fetch it and confirm it is real iCal.
async function isValidIcs(url: string): Promise<boolean> {
  try {
    const r = await fetch(url, { headers: { "User-Agent": "LetsLiinger/1.0" } });
    if (!r.ok) return false;
    const t = await r.text();
    return t.includes("BEGIN:VCALENDAR") && t.includes("BEGIN:VEVENT");
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  try {
    const { school, domain } = await req.json().catch(() => ({}));
    if (!school) return json({ error: "school is required" }, 400);
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Only discover once per school.
    const { data: existing } = await supabase
      .from("event_sources").select("feed_url").eq("school", school).limit(1);
    if (existing && existing.length) return json({ status: "exists", feed_url: existing[0].feed_url });

    const candidates = await askGemini(school, domain ?? "");
    for (const url of candidates) {
      if (await isValidIcs(url)) {
        const { error } = await supabase.from("event_sources")
          .insert({ school, feed_url: url, platform: "unknown", status: "active" });
        if (!error) return json({ status: "found", feed_url: url });
      }
    }
    return json({ status: "not_found", tried: candidates });
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});
