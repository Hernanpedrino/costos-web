// lib/mail.ts
// Envío de mails por SMTP (Google Workspace de elchilo.com).
// Config en .env: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS (contraseña de
// aplicación de la cuenta que envía) y MAIL_ATENCION (destino de los avisos).

import nodemailer, { type Transporter } from "nodemailer"

const globalForMail = globalThis as unknown as { mailTransporter?: Transporter }

function getTransporter(): Transporter | null {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) return null

  if (!globalForMail.mailTransporter) {
    const port = Number(SMTP_PORT ?? 465)
    globalForMail.mailTransporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port,
      secure: port === 465, // 465 = TLS directo; 587 = STARTTLS
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    })
  }
  return globalForMail.mailTransporter
}

/**
 * Manda un mail de texto plano. Si falta la configuración SMTP, avisa por
 * consola y no hace nada: un mail que no sale no tiene que romper el flujo
 * que lo dispara.
 */
export async function enviarMail({ to, subject, text }: { to: string; subject: string; text: string }): Promise<void> {
  const transporter = getTransporter()
  if (!transporter) {
    console.warn(`[mail] SMTP sin configurar — no se envió "${subject}" a ${to}`)
    return
  }

  await transporter.sendMail({
    from: `"Costos El Chilo" <${process.env.SMTP_USER}>`,
    to,
    subject,
    text,
  })
}
