const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_SECURE === "true", // true for port 465
  family: 4,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASSWORD,
  },
});

const parseFrom = (raw, fallbackEmail) => {
  const match = /^\s*"?([^"<]*)"?\s*<(.+)>\s*$/.exec(raw || "");
  if (match) return { name: match[1].trim() || "FinReq", email: match[2].trim() };
  return { name: "FinReq", email: (raw || fallbackEmail || "").trim() };
};


const sendViaBrevoApi = async ({ to, subject, html }) => {
  const sender = parseFrom(process.env.SMTP_FROM, process.env.SMTP_USER);
  const res = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "api-key": process.env.BREVO_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      sender,
      to: [{ email: to }],
      subject,
      htmlContent: html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Brevo API ${res.status}: ${body.slice(0, 300)}`);
  }
};

const sendMail = async ({ to, subject, html }) => {
  if (process.env.BREVO_API_KEY) {
    await sendViaBrevoApi({ to, subject, html });
    return true;
  }

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    console.warn("[mailer] Neither BREVO_API_KEY nor SMTP is configured — skipping email to", to);
    return false;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || `"FinReq" <${process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
  return true;
};

const sendInviteEmail = async ({ to, inviteLink, companyName, invitedByName }) => {
  const fullLink = `${process.env.CLIENT_URL || "http://localhost:5173"}${inviteLink}`;
  return sendMail({
    to, 
    subject: `You've been invited to join ${companyName} on FinReq`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1e293b">
        <h2 style="font-size:22px;font-weight:700;margin-bottom:8px">You're invited!</h2>
        <p style="color:#475569;margin-bottom:24px">
          ${invitedByName ? `<strong>${invitedByName}</strong> has invited you to join` : "You've been invited to join"}
          <strong> ${companyName}</strong> on FinReq — a financial requisition management platform.
        </p>
        <a href="${fullLink}"
           style="display:inline-block;background:#4f46e5;color:#fff;font-weight:600;font-size:14px;
                  padding:12px 24px;border-radius:8px;text-decoration:none;margin-bottom:24px">
          Accept Invitation
        </a>
        <p style="color:#94a3b8;font-size:13px">
          This link expires in 24 hours. If you weren't expecting this, you can ignore it.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
        <p style="color:#cbd5e1;font-size:12px">© ${new Date().getFullYear()} FinReq</p>
      </div>
    `,
  });
};

const sendPasswordResetEmail = async ({ to, resetLink }) => {
  const fullLink = `${process.env.CLIENT_URL || "http://localhost:5173"}${resetLink}`;
  return sendMail({
    to,
    subject: "Reset your FinReq password",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;color:#1e293b">
        <h2 style="font-size:22px;font-weight:700;margin-bottom:8px">Reset your password</h2>
        <p style="color:#475569;margin-bottom:24px">
          We received a request to reset the password on your FinReq account. Click below to choose a new one.
        </p>
        <a href="${fullLink}"
           style="display:inline-block;background:#4f46e5;color:#fff;font-weight:600;font-size:14px;
                  padding:12px 24px;border-radius:8px;text-decoration:none;margin-bottom:24px">
          Reset Password
        </a>
        <p style="color:#94a3b8;font-size:13px">
          This link expires in 1 hour. If you didn't request this, you can safely ignore it — your password won't change.
        </p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:24px 0" />
        <p style="color:#cbd5e1;font-size:12px">© ${new Date().getFullYear()} FinReq</p>
      </div>
    `,
  });
};

module.exports = { sendMail, sendInviteEmail, sendPasswordResetEmail };
