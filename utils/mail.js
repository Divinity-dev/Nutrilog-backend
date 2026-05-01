import { transporter } from "../models/newsLetter.js"


export const sendEmail = async ({ to, subject, text, html }) => {
  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL,
      to,
      subject,
      text,
      html,
    });
    console.log("Email sent successfully to:", to);
    return info;
  } catch (error) {
    console.error("Email sending failed:", error);
    throw error; // Re-throw to let caller handle
  }
};