import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import nodemailer from "nodemailer";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

app.get("/", (req, res) => {
  res.send("The Wedding Tree Backend is running!");
});

app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, phone, eventType, message } = req.body;

    // Email to you (arshanshaikh200@gmail.com)
    const mailToYou = {
      from: process.env.SMTP_USER,
      to: process.env.RECEIVER_EMAIL,
      subject: "New Contact Form Submission - The Wedding Tree",
      html: `
        <h2>New Inquiry Received</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> ${email}</p>
        <p><strong>Phone:</strong> ${phone || "Not provided"}</p>
        <p><strong>Event Type:</strong> ${eventType || "Not provided"}</p>
        <p><strong>Message:</strong> ${message || "No message"}</p>
      `,
    };

    // Thank you email to the user
    const thankYouMail = {
      from: process.env.SMTP_USER,
      to: email,
      subject: "Thank You for Contacting The Wedding Tree",
      html: `
        <h2>Dear ${name},</h2>
        <p>Thank you for reaching out to <strong>The Wedding Tree</strong>!</p>
        <p>We have received your inquiry and our team will get back to you as soon as possible.</p>
        <p>We can't wait to help you plan your special day!</p>
        <br>
        <p>Warm regards,</p>
        <p><strong>The Wedding Tree Team</strong></p>
      `,
    };

    await transporter.sendMail(mailToYou);
    await transporter.sendMail(thankYouMail);

    res.status(200).json({ message: "Emails sent successfully!" });
  } catch (error) {
    console.error("Error sending emails:", error);
    res.status(500).json({ error: "Failed to send emails" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
