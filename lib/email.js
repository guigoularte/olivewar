// Envio de e-mail pelo backend usando EmailJS (REST API).
// Reaproveita o serviço que o Oliver já usa no navegador.
// Precisa de uma variável de ambiente: EMAILJS_PRIVATE_KEY (chave privada p/ chamadas server-side)
// e EMAILJS_TEMPLATE (id de um template genérico com os campos to_email, assunto, conteudo).

const SERVICE_ID = process.env.EMAILJS_SERVICE_ID || "service_yuf3qik";
const PUBLIC_KEY = process.env.EMAILJS_PUBLIC_KEY || "Jwl7iLqUNND6syxRU";

function emailConfigurado() {
  return !!(process.env.EMAILJS_TEMPLATE && process.env.EMAILJS_PRIVATE_KEY);
}

// conteudo: HTML (use {{{conteudo}}} no template do EmailJS p/ não escapar)
async function enviarEmail(to_email, assunto, conteudo) {
  const resp = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service_id: SERVICE_ID,
      template_id: process.env.EMAILJS_TEMPLATE,
      user_id: PUBLIC_KEY,
      accessToken: process.env.EMAILJS_PRIVATE_KEY,
      template_params: { to_email, assunto, conteudo }
    })
  });
  if (!resp.ok) { const t = await resp.text(); throw new Error("EmailJS " + resp.status + ": " + t); }
  return true;
}

module.exports = { enviarEmail, emailConfigurado };
