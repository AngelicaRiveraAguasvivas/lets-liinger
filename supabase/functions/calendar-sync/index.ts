import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

// ---- minimal RFC5545 iCal parsing ----
function unfold(ics: string): string {
  return ics.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "");
}
function splitEvents(ics: string): string[] {
  const blocks: string[] = [];
  const re = /BEGIN:VEVENT([\s\S]*?)END:VEVENT/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(ics))) blocks.push(m[1]);
  return blocks;
}
function field(block: string, name: string): string | null {
  const re = new RegExp("^" + name + "([^:\\r\\n]*):(.*)$", "im");
  const m = block.match(re);
  return m ? m[2].trim() : null;
}
function unescapeText(v: string): string {
  return v.replace(/\\n/gi, "\n").replace(/\\,/g, ",").replace(/\\;/g, ";").replace(/\\\\/g, "\\");
}
// iCal date/time -> app's naive "YYYY-MM-DDTHH:MM:SS". Date-only -> midnight.
// Trailing Z (UTC) is used as wall-clock (v1: no per-source tz conversion).
function toNaive(value: string): string | null {
  const d = value.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (d) return `${d[1]}-${d[2]}-${d[3]}T00:00:00`;
  const t = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z?$/);
  if (t) return `${t[1]}-${t[2]}-${t[3]}T${t[4]}:${t[5]}:${t[6]}`;
  return null;
}

Deno.serve(async () => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: sources } = await supabase.from("event_sources").select("*").eq("status", "active");
  const results: unknown[] = [];
  const cutoff = Date.now() - 24 * 3600 * 1000; // keep events from yesterday on

  for (const src of sources ?? []) {
    try {
      const res = await fetch(src.feed_url, { headers: { "User-Agent": "LetsLiinger/1.0" } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const ics = unfold(await res.text());
      const rows: Record<string, unknown>[] = [];
      for (const b of splitEvents(ics)) {
        const uid = field(b, "UID");
        const summary = field(b, "SUMMARY");
        const dtstart = field(b, "DTSTART");
        if (!uid || !summary || !dtstart) continue;
        const naive = toNaive(dtstart);
        if (naive) {
          const ms = new Date(naive).getTime();
          if (!isNaN(ms) && ms < cutoff) continue; // skip past events
        }
        const desc = field(b, "DESCRIPTION");
        const loc = field(b, "LOCATION");
        rows.push({
          source: "calendar",
          source_id: src.id,
          source_uid: uid,
          title: unescapeText(summary).slice(0, 200),
          description: desc ? unescapeText(desc).slice(0, 2000) : null,
          location: loc ? unescapeText(loc).slice(0, 300) : null,
          event_time: naive,
          school: src.school,
          visibility: "school",
          host: null,
          created_by: null,
        });
      }
      if (rows.length) {
        const { error } = await supabase
          .from("events")
          .upsert(rows, { onConflict: "source_id,source_uid", ignoreDuplicates: false });
        if (error) throw error;
      }
      await supabase.from("event_sources").update({
        last_synced: new Date().toISOString(), last_error: null,
        imported_count: rows.length, status: "active",
      }).eq("id", src.id);
      results.push({ school: src.school, imported: rows.length });
    } catch (e) {
      await supabase.from("event_sources").update({
        last_synced: new Date().toISOString(), last_error: String(e), status: "error",
      }).eq("id", src.id);
      results.push({ school: src.school, error: String(e) });
    }
  }
  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { "Content-Type": "application/json" },
  });
});
