import nodemailer from "nodemailer";

let transporter;

const getTransporter = () => {
  if (transporter) return transporter;

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!user || !pass) {
    throw new Error("Email is not configured. Set SMTP_USER and SMTP_PASS in the hosting environment.");
  }

  const port = Number(process.env.SMTP_PORT || 465);
  const secure = process.env.SMTP_SECURE
    ? process.env.SMTP_SECURE.toLowerCase() === "true"
    : port === 465;

  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port,
    secure,
    auth: { user, pass },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
  });

  return transporter;
};

export const sendEmail = async ({ to, subject, html, text }) => {
  if (!to || !subject || (!html && !text)) {
    throw new Error("Email recipient, subject, and message content are required.");
  }

  const from = process.env.MAIL_FROM || `NutriBlogHub <${process.env.SMTP_USER || "no-reply@nutribloghub.com"}>`;
  return getTransporter().sendMail({ from, to, subject, html, text });
};
