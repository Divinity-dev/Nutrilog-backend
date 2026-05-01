import dotenv from "dotenv";
dotenv.config();

import nodemailer from "nodemailer";

export const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL?.trim(),
    pass: process.env.PASSWORD?.trim(),
  },
});

// Verify transporter connection
transporter.verify((error, success) => {
  if (error) {
    console.log("Transporter verification failed:", error);
  } else {
    console.log("Transporter is ready to send emails");
  }
});