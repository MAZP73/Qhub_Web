// Aviso de turno al instante: la API Qhub llama a esta función en el momento en que crea un aviso (canal "webhook") y aquí se manda
// el push (Expo) y el correo (Brevo) a esa persona, sin esperar a la revisión periódica de qhub-push (que queda como red de seguridad).
// Protegida por AVISOS_WEBHOOK_SECRET (cabecera x-aviso-secret). Reclama cada aviso antes de enviarlo: si el cron lo toma a la vez, no se duplica.
import { createClient } from "npm:@supabase/supabase-js@2";
import { avisoHtml, enviarBrevo } from "../_shared/aviso_email.ts";
import { deadTokens, freshNotifications, pushMessages } from "../_shared/push.ts";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const EXPO = "https://exp.host/--/api/v2/push/send";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Comparación en tiempo constante para no filtrar el secreto por tiempos de respuesta. */
function sameSecret(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

Deno.serve(async (req) => {
  const secret = Deno.env.get("AVISOS_WEBHOOK_SECRET");
  if (req.method !== "POST" || !secret || !sameSecret(req.headers.get("x-aviso-secret") ?? "", secret)) return json(401, { error: "No autorizado" });

  const input = await req.json().catch(() => null) as Record<string, unknown> | null;
  const n = input?.notificacion as Record<string, unknown> | undefined;
  const userId = typeof input?.usuario_id === "string" ? input.usuario_id : "";
  if (!n || !UUID.test(userId) || typeof n.id !== "string" || typeof n.mensaje !== "string") return json(400, { error: "Aviso inválido" });
  const turnoId = typeof n.turno_id === "string" ? n.turno_id : null;
  if (!turnoId) return json(200, { omitido: "sin turno" });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  // De qué organización es el turno (la API solo conoce a la cuenta; la app guarda el vínculo en el historial).
  const { data: turno } = await admin.from("historial_turnos").select("organizacion_id").eq("qhub_turno_id", turnoId).eq("usuario_id", userId).limit(1).maybeSingle();
  if (!turno) return json(200, { omitido: "turno sin organización conocida" });   // la revisión periódica lo cubre
  const orgId = turno.organizacion_id as string;

  const aviso = { id: n.id, mensaje: n.mensaje, leida: n.leida === true, creada_en: String(n.creada_en ?? new Date().toISOString()), tipo_aviso: typeof n.tipo_aviso === "string" ? n.tipo_aviso : null, turno_id: turnoId };
  if (freshNotifications([aviso], new Set(), Date.now()).length === 0) return json(200, { omitido: "aviso no vigente" });

  const { data: org } = await admin.from("organizaciones").select("nombre").eq("id", orgId).maybeSingle();
  const orgName = (org?.nombre as string | undefined) ?? "";
  const claim = async (table: string): Promise<boolean> => {
    const { data } = await admin.from(table).upsert([{ usuario_id: userId, organizacion_id: orgId, aviso_id: aviso.id }],
      { onConflict: "usuario_id,organizacion_id,aviso_id", ignoreDuplicates: true }).select("aviso_id");
    return (data ?? []).length > 0;
  };

  let push = 0, correo = 0;
  // push (Expo)
  const { data: devices } = await admin.from("dispositivos_push").select("token").eq("usuario_id", userId);
  const tokens = (devices ?? []).map((d) => d.token as string);
  if (tokens.length && await claim("avisos_push_enviados")) {
    const messages = pushMessages(tokens, aviso, orgId, orgName);
    const res = await fetch(EXPO, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(messages) }).catch(() => null);
    if (res?.ok) {
      push = messages.length;
      const body = await res.json().catch(() => null);
      const dead = deadTokens(messages, body?.data);
      if (dead.length) await admin.from("dispositivos_push").delete().in("token", dead);
    } else console.error("Expo rechazó el aviso", res?.status);
  }
  // correo (Brevo)
  const key = Deno.env.get("BREVO_API_KEY"), from = Deno.env.get("EMAIL_FROM");
  if (key && from && await claim("avisos_correo_enviados")) {
    const to = (await admin.auth.admin.getUserById(userId)).data.user?.email;
    const titulo = orgName ? `${orgName}: ${aviso.mensaje}`.slice(0, 120) : aviso.mensaje.slice(0, 120);
    if (to && await enviarBrevo(to, titulo, avisoHtml({ titulo: orgName || "Tu turno en Qhub", mensaje: aviso.mensaje }), { key, from, name: Deno.env.get("EMAIL_FROM_NAME") ?? "Qhub" })) correo = 1;
    else await admin.from("avisos_correo_enviados").delete().eq("usuario_id", userId).eq("organizacion_id", orgId).eq("aviso_id", aviso.id);   // se reintenta en la revisión periódica
  }
  return json(200, { push, correo });
});
