import type { APIRoute } from "astro";
import Stripe from "stripe";
import nodemailer from "nodemailer";
import { supabaseServer } from "../../lib/supabaseServer";

function getStripe() {
  const key = import.meta.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Falta STRIPE_SECRET_KEY en .env");
  return new Stripe(key, { apiVersion: "2026-02-25.clover" });
}

/** Enviar correo de confirmación real vía Gmail SMTP con nodemailer. */
async function sendConfirmationEmail(
  email: string,
  nombre: string,
  numeroSolicitud: string,
  cuotaTexto: string,
) {
  const gmailUser = import.meta.env.GMAIL_USER;
  const gmailPass = import.meta.env.GMAIL_APP_PASSWORD;
  if (!gmailUser || !gmailPass) {
    console.error("Faltan GMAIL_USER o GMAIL_APP_PASSWORD en .env — correo no enviado");
    return;
  }

  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user: gmailUser, pass: gmailPass },
  });

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:600px;margin:0 auto;padding:32px">
      <h2 style="color:#049689">¡Bienvenido/a, ${nombre}!</h2>
      <p>Tu afiliación al <strong>Partido República de las Islas Feroe</strong> se ha completado correctamente.</p>
      <p style="font-size:18px">Tu número de solicitud de afiliación es:</p>
      <div style="background:#f0faf9;border:2px solid #2CBDBF;border-radius:12px;padding:18px 24px;text-align:center;margin:16px 0">
        <strong style="font-size:22px;letter-spacing:0.04em;color:#049689">${numeroSolicitud}</strong>
      </div>
      <p><strong>Cuota mensual:</strong> ${cuotaTexto}</p>
      <p>Guarda este número para futuras gestiones internas, votaciones y comunicaciones del partido.</p>
      <p>Si tienes alguna duda, escríbenos a través de nuestra <a href="https://feroe.netlify.app/contacto" style="color:#049689">página de contacto</a>.</p>
      <hr style="border:none;border-top:1px solid #e0e0e0;margin:24px 0" />
      <p style="font-size:13px;color:#888">Partido República de las Islas Feroe — Tjóðveldi</p>
    </div>
  `;

  await transporter.sendMail({
    from: `"Partido República Feroe" <${gmailUser}>`,
    to: email,
    subject: `Confirmación de afiliación ${numeroSolicitud} — Partido República Feroe`,
    html,
  });
}

export const POST: APIRoute = async ({ request }) => {
  try {
    const stripe = getStripe();
    const webhookSecret = import.meta.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      return new Response("Falta STRIPE_WEBHOOK_SECRET", { status: 500 });
    }

    const body = await request.text();
    const sig = request.headers.get("stripe-signature");

    if (!sig) {
      return new Response("Missing stripe-signature header", { status: 400 });
    }

    let event: Stripe.Event;
    try {
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch {
      return new Response("Webhook signature verification failed", { status: 400 });
    }

    // --- Handle checkout.session.completed ---
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const afiliacionId = session.metadata?.afiliacion_id;

      if (!afiliacionId) {
        return new Response("No afiliacion_id in metadata", { status: 400 });
      }

      // Update affiliation: mark as active, store Stripe IDs
      await supabaseServer
        .from("afiliaciones")
        .update({
          estado: "activa",
          stripe_customer_id: session.customer as string,
          stripe_subscription_id: session.subscription as string,
        })
        .eq("id", afiliacionId);

      // Fetch affiliation details for the email
      const { data: afiliacion } = await supabaseServer
        .from("afiliaciones")
        .select("nombre, apellidos, email, numero_solicitud, cuota_importe_centimos")
        .eq("id", afiliacionId)
        .single();

      if (afiliacion) {
        const cuotaTexto = `${(afiliacion.cuota_importe_centimos / 100).toFixed(2)} €`;
        await sendConfirmationEmail(
          afiliacion.email,
          `${afiliacion.nombre} ${afiliacion.apellidos}`,
          afiliacion.numero_solicitud ?? afiliacionId,
          cuotaTexto,
        );
      }
    }

    // --- Handle subscription cancelled ---
    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      await supabaseServer
        .from("afiliaciones")
        .update({ estado: "baja" })
        .eq("stripe_subscription_id", subscription.id);
    }

    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return new Response("Webhook handler error", { status: 500 });
  }
};
