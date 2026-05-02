import dotenv from "dotenv";
dotenv.config();

import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 587,
  secure: false, // IMPORTANT (fixes Render + network issues)
  auth: {
    user: process.env.EMAIL?.trim(),
    pass: process.env.PASSWORD?.trim(),
  },
  tls: {
    rejectUnauthorized: false
  }
});