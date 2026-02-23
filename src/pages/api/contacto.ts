import type { APIRoute } from "astro";
import { supabaseServer } from "../../lib/supabaseServer.ts";

function isEmail(email: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const form = await request.formData();

    // Honeypot anti-spam (campo oculto)
    const web = String(form.get("web") ?? "").trim();
    if (web) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }

    // Estos nombres deben coincidir con el "name" del formulario
    const nombre = String(form.get("nombre") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const asunto = String(form.get("asunto") ?? "").trim();
    const mensaje = String(form.get("mensaje") ?? "").trim();

    // Validación básica
    if (nombre.length < 2 || nombre.length > 120) {
      return new Response(JSON.stringify({ ok: false, error: "Nombre no válido" }), { status: 400 });
    }
    if (!isEmail(email)) {
      return new Response(JSON.stringify({ ok: false, error: "Email no válido" }), { status: 400 });
    }
    if (asunto.length > 140) {
      return new Response(JSON.stringify({ ok: false, error: "Asunto demasiado largo" }), { status: 400 });
    }
    if (mensaje.length < 5 || mensaje.length > 4000) {
      return new Response(JSON.stringify({ ok: false, error: "Mensaje no válido" }), { status: 400 });
    }

    const { error } = await supabaseServer.from("contacto_mensajes").insert({
      nombre,
      email,
      asunto: asunto || null,
      mensaje,
      origen: "web",
    });

    if (error) {
      return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response(JSON.stringify({ ok: false, error: "Error inesperado" }), { status: 500 });
  }
};
