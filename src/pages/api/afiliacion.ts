import type { APIRoute } from "astro";
import Stripe from "stripe";
import { supabaseServer } from "../../lib/supabaseServer";

const DNI_NIE_RE = /^[0-9]{8}[A-Z]$|^[XYZ][0-9]{7}[A-Z]$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getStripe() {
  const key = import.meta.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Falta STRIPE_SECRET_KEY en .env");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

export const POST: APIRoute = async ({ request, url }) => {
  try {
    const data = await request.json();

    // --- Validaciones ---
    const nombre = String(data.nombre ?? "").trim();
    const apellidos = String(data.apellidos ?? "").trim();
    const dni_nie = String(data.dni_nie ?? "").trim().toUpperCase();
    const fecha_nacimiento = String(data.fecha_nacimiento ?? "").trim();
    const direccion = String(data.direccion ?? "").trim();
    const ciudad = String(data.ciudad ?? "").trim();
    const provincia = String(data.provincia ?? "").trim();
    const codigo_postal = String(data.codigo_postal ?? "").trim();
    const email = String(data.email ?? "").trim().toLowerCase();
    const telefono = String(data.telefono ?? "").trim();
    const nivel_estudios = String(data.nivel_estudios ?? "").trim() || null;
    const ocupacion = String(data.ocupacion ?? "").trim() || null;
    const genero = String(data.genero ?? "").trim() || null;
    const acepta_politica_privacidad = data.acepta_politica_privacidad === true;
    const acepta_comunicaciones = data.acepta_comunicaciones === true;
    const cuota_importe_centimos = parseInt(data.cuota_importe_centimos, 10);

    const errors: string[] = [];

    if (nombre.length < 2 || nombre.length > 120) errors.push("Nombre no válido");
    if (apellidos.length < 2 || apellidos.length > 200) errors.push("Apellidos no válidos");
    if (!DNI_NIE_RE.test(dni_nie)) errors.push("DNI/NIE no válido (formato: 12345678A o X1234567A)");
    if (!fecha_nacimiento || isNaN(Date.parse(fecha_nacimiento))) errors.push("Fecha de nacimiento no válida");
    if (direccion.length < 3) errors.push("Dirección no válida");
    if (ciudad.length < 2) errors.push("Ciudad no válida");
    if (provincia.length < 2) errors.push("Provincia/región no válida");
    if (codigo_postal.length < 4 || codigo_postal.length > 10) errors.push("Código postal no válido");
    if (!EMAIL_RE.test(email)) errors.push("Email no válido");
    if (telefono.length < 6 || telefono.length > 20) errors.push("Teléfono no válido");
    if (!acepta_politica_privacidad) errors.push("Debes aceptar la política de privacidad");
    if (isNaN(cuota_importe_centimos) || cuota_importe_centimos < 1500) errors.push("Importe de cuota mínimo: 15 €");

    if (errors.length > 0) {
      return new Response(JSON.stringify({ ok: false, errors }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    // --- Insertar afiliación en Supabase (estado: pendiente_pago) ---
    const { data: row, error: dbError } = await supabaseServer
      .from("afiliaciones")
      .insert({
        estado: "pendiente_pago",
        nombre,
        apellidos,
        dni_nie,
        fecha_nacimiento,
        direccion,
        ciudad,
        provincia,
        codigo_postal,
        email,
        telefono,
        nivel_estudios,
        ocupacion,
        genero,
        acepta_politica_privacidad,
        acepta_comunicaciones,
        cuota_periodicidad: "mensual",
        cuota_importe_centimos,
        cuota_moneda: "EUR",
      })
      .select("id")
      .single();

    if (dbError) {
      if (dbError.code === "23505") {
        return new Response(
          JSON.stringify({ ok: false, errors: ["Ya existe una afiliación con ese DNI/NIE o email"] }),
          { status: 409, headers: { "content-type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ ok: false, errors: [dbError.message] }),
        { status: 500, headers: { "content-type": "application/json" } },
      );
    }

    const afiliacionId = row.id;

    // --- Generar número de solicitud secuencial SOL-AFI-XXXX ---
    const { count } = await supabaseServer
      .from("afiliaciones")
      .select("id", { count: "exact", head: true });

    const secuencial = String(count ?? 1).padStart(4, "0");
    const numeroSolicitud = `SOL-AFI-${secuencial}`;

    await supabaseServer
      .from("afiliaciones")
      .update({ numero_solicitud: numeroSolicitud })
      .eq("id", afiliacionId);

    // --- Crear Stripe Checkout Session (suscripción mensual) ---
    const stripe = getStripe();
    const origin = url.origin;

    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      payment_method_types: ["card"],
      customer_email: email,
      metadata: { afiliacion_id: afiliacionId },
      line_items: [
        {
          price_data: {
            currency: "eur",
            unit_amount: cuota_importe_centimos,
            recurring: { interval: "month" },
            product_data: {
              name: "Cuota de afiliación — Partido República Feroe",
              description: `Cuota mensual de ${(cuota_importe_centimos / 100).toFixed(2)} €`,
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${origin}/afiliacion-ok?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/participa#form`,
    });

    // Guardar el checkout session id en la afiliación
    await supabaseServer
      .from("afiliaciones")
      .update({ stripe_checkout_session_id: session.id })
      .eq("id", afiliacionId);

    return new Response(JSON.stringify({ ok: true, checkout_url: session.url }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error inesperado en el servidor";
    return new Response(
      JSON.stringify({ ok: false, errors: [message] }),
      { status: 500, headers: { "content-type": "application/json" } },
    );
  }
};
