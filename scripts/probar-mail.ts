/**
 * scripts/probar-mail.ts
 *
 * Manda un mail de prueba a MAIL_ATENCION para verificar la config SMTP.
 * No toca Bejerman ni MySQL.
 *
 *   npx tsx scripts/probar-mail.ts
 */

import { config } from "dotenv"
import { enviarMail } from "../lib/mail"

// Mismo orden que Next: .env.local pisa a .env
config({ path: [".env.local", ".env"], quiet: true })

const destino = process.env.MAIL_ATENCION ?? "hernanpedrino@elchilo.com"

enviarMail({
  to: destino,
  subject: "Prueba SMTP — costos-web",
  text: "Si llegó este mail, los avisos de \"Hablar con persona\" del chatbot van a funcionar.",
})
  .then(() => console.log(`Mail enviado a ${destino} (si SMTP no está configurado, ver el aviso de arriba).`))
  .catch((err) => {
    console.error("Falló el envío:", err)
    process.exitCode = 1
  })
