// api/send-email.js
import nodemailer from "nodemailer";

/**
 * Vercel serverless function to send order notification emails.
 * Expects POST JSON body: { orderMeta: {...}, items: [...] }
 *
 * Environment variables (set in Vercel dashboard or .env.local for local dev):
 *  - SMTP_HOST (optional, defaults to smtp.gmail.com)
 *  - SMTP_PORT (optional, defaults to 587)
 *  - SMTP_USER  (your Gmail address)
 *  - SMTP_PASS  (App Password generated in Google account)
 *  - EMAIL_TO   (destination email, e.g. profzzen@gmail.com)
 *
 * Note: For Vercel, set these variables in the project Settings > Environment Variables.
 */

const host = process.env.SMTP_HOST || "smtp.gmail.com";
const port = process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587;
const user = process.env.SMTP_USER;
const pass = process.env.SMTP_PASS;
const destination = process.env.EMAIL_TO || process.env.SMTP_USER;

function buildHtml(orderMeta, items) {
  const rows = (items || []).map(it => {
    const title = escapeHtml(it.title || '');
    const qty = escapeHtml(String(it.qty || 1));
    const price = escapeHtml(String(it.price || '')) + ' XOF';
    return `<tr><td style="padding:6px 8px;border-bottom:1px solid #eee">${title}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:center">${qty}</td><td style="padding:6px 8px;border-bottom:1px solid #eee;text-align:right">${price}</td></tr>`;
  }).join('');

  const total = (items || []).reduce((s,i)=> s + (Number(i.price||0) * Number(i.qty||1)), 0);

  return `
    <div style="font-family:Arial,Helvetica,sans-serif;color:#0b2a3a">
      <h2>Nouvelle commande ${escapeHtml(orderMeta.order_number || '')}</h2>
      <p><strong>Client :</strong> ${escapeHtml(orderMeta.order_name || '')}</p>
      <p><strong>Tél :</strong> ${escapeHtml(orderMeta.phone || '')} — <strong>Adresse :</strong> ${escapeHtml(orderMeta.shipping_address || '')}</p>
      <table style="width:100%;border-collapse:collapse;margin-top:12px">
        <thead>
          <tr><th style="text-align:left;padding:6px 8px;border-bottom:2px solid #ccc">Article</th><th style="padding:6px 8px;border-bottom:2px solid #ccc">Qté</th><th style="padding:6px 8px;border-bottom:2px solid #ccc;text-align:right">Prix</th></tr>
        </thead>
        <tbody>
          ${rows}
          <tr><td colspan="2" style="padding:8px;text-align:right"><strong>Total</strong></td><td style="padding:8px;text-align:right"><strong>${escapeHtml(String(total))} XOF</strong></td></tr>
        </tbody>
      </table>
      <p style="margin-top:14px;color:#6b7b8f">ID commande interne: ${escapeHtml(String(orderMeta.id || ''))}</p>
    </div>
  `;
}

function escapeHtml(s='') {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!user || !pass) {
    console.error('SMTP credentials not configured (SMTP_USER/SMTP_PASS)');
    return res.status(500).json({ error: 'SMTP credentials not configured' });
  }

  try {
    const body = req.body && Object.keys(req.body).length ? req.body : JSON.parse(await getRawBody(req));
    const { orderMeta, items } = body;

    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465, // true for 465, false for other ports (STARTTLS)
      auth: {
        user,
        pass
      }
    });

    // verify connection (optional)
    try {
      await transporter.verify();
    } catch (verifyErr) {
      console.warn('SMTP verify warning:', verifyErr && verifyErr.message);
      // continue: we'll still attempt to send and surface errors if any
    }

    const html = buildHtml(orderMeta || {}, items || []);
    const subject = `Nouvelle commande ${orderMeta?.order_number || ''}`;

    const mailOptions = {
      from: `"Medical Shop" <${user}>`,
      to: destination,
      subject,
      html
    };

    const info = await transporter.sendMail(mailOptions);

    return res.status(200).json({ ok: true, messageId: info.messageId, accepted: info.accepted });
  } catch (err) {
    console.error('api/send-email error', err);
    return res.status(500).json({ error: err.message || 'send failed' });
  }
}

// helper to get raw body if needed (for some serverless setups)
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', err => reject(err));
  });
}
