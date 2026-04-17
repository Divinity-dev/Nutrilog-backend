import { transporter } from "../models/newsLetter.js"


export const sendEmail = async ({ to, subject, text, html }) => {
  try {
    
    await transporter.sendMail({
      from: process.env.EMAIL,
      to,
      subject,
      text,
      html,
    });
    
  } catch (error) {
    console.log("Email error:", error);
  }
};