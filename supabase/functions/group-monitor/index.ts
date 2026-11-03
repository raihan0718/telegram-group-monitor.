import { handleUpdate } from "./src/handler.ts";
import { json } from "./src/http.ts";
Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ ok: true, service: "group-monitor" });
  const secret = Deno.env.get("WEBHOOK_SECRET");
  if (secret && req.headers.get("x-telegram-bot-api-secret-token") !== secret) return json({ error: "unauthorized" }, 401);
  try { await handleUpdate(await req.json()); return json({ ok: true }); }
  catch (error) { console.error("update_failed", error); return json({ error: "internal_error" }, 500); }
});
