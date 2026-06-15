import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Resend } from "resend";
const resend = new Resend(process.env.RESEND_API_KEY);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());



app.get("/", (req, res) => {
  res.send("The Wedding Tree Backend is running!");
});

app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, phone, eventType, message } = req.body;

    // Email to YOU
    await resend.emails.send({
      from: "The Wedding Tree <onboarding@resend.dev>",
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
    });

    // Thank you email to USER
    await resend.emails.send({
      from: "The Wedding Tree <onboarding@resend.dev>",
      to: email,
      subject: "Thank You for Contacting The Wedding Tree",
      html: `
        <h2>Dear ${name},</h2>
        <p>Thank you for reaching out to <strong>The Wedding Tree</strong>!</p>
        <p>We have received your inquiry and will contact you soon.</p>
        <br/>
        <p>Warm regards,<br/>The Wedding Tree Team</p>
      `,
    });

    res.status(200).json({ message: "Emails sent successfully!" });

  } catch (error) {
    console.error("Error sending emails:", error);
    res.status(500).json({ error: "Failed to send emails" });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

