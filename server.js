import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Initialize Supabase
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure Multer for file uploads (in-memory storage)
const storage = multer.memoryStorage();
const upload = multer({ storage });

// Test endpoint
app.get("/", (req, res) => {
  res.send("The Wedding Tree Backend is running!");
});

// ------------------------------
// CONTACT FORM ENDPOINT
// ------------------------------
app.post("/api/contact", async (req, res) => {
  try {
    const { name, email, phone, eventType, message } = req.body;

    // 1. Save to Supabase
    const { data, error } = await supabase
      .from("contacts")
      .insert([{ name, email, phone, event_type: eventType, message }])
      .select();

    if (error) throw error;

    // 2. Send email via Resend (to business owner)
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

    // 3. Send thank you email to user
    await resend.emails.send({
      from: "The Wedding Tree <onboarding@resend.dev>",
      to: email,
      subject: "Thank You for Contacting The Wedding Tree",
      html: `
        <h2>Dear ${name},</h2>
        <p>Thank you for reaching out to <strong>The Wedding Tree</strong>!</p>
        <p>We have received your inquiry and our team will get back to you as soon as possible.</p>
        <p>We can't wait to help you plan your special day!</p>
        <br/>
        <p>Warm regards,<br/>The Wedding Tree Team</p>
      `,
    });

    res.status(200).json({ message: "Contact submitted successfully!", data });
  } catch (error) {
    console.error("Error in contact form:", error);
    res.status(500).json({ error: "Failed to submit contact form", details: error.message });
  }
});

// ------------------------------
// PHOTOS ENDPOINTS
// ------------------------------
// Upload photo
app.post("/api/photos", upload.single("image"), async (req, res) => {
  try {
    const { title, category } = req.body;

    // Upload to Cloudinary
    const result = await new Promise((resolve, reject) => {
      const uploadStream = cloudinary.uploader.upload_stream(
        { folder: "theweddingtree" },
        (error, result) => {
          if (error) reject(error);
          else resolve(result);
        }
      );
      uploadStream.end(req.file.buffer);
    });

    // Save to Supabase
    const { data, error } = await supabase
      .from("photos")
      .insert([
        {
          title,
          category,
          image_url: result.secure_url,
          public_id: result.public_id,
        },
      ])
      .select();

    if (error) throw error;

    res.status(200).json({ message: "Photo uploaded successfully!", data });
  } catch (error) {
    console.error("Error uploading photo:", error);
    res.status(500).json({ error: "Failed to upload photo", details: error.message });
  }
});

// Get all photos
app.get("/api/photos", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("photos")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    console.error("Error fetching photos:", error);
    res.status(500).json({ error: "Failed to fetch photos", details: error.message });
  }
});

// Update photo
app.put("/api/photos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, category } = req.body;

    const { data, error } = await supabase
      .from("photos")
      .update({ title, category })
      .eq("id", id)
      .select();

    if (error) throw error;
    res.status(200).json({ message: "Photo updated successfully!", data });
  } catch (error) {
    console.error("Error updating photo:", error);
    res.status(500).json({ error: "Failed to update photo", details: error.message });
  }
});

// Delete photo
app.delete("/api/photos/:id", async (req, res) => {
  try {
    const { id } = req.params;

    // Get photo from Supabase first to get public_id
    const { data: photoData, error: fetchError } = await supabase
      .from("photos")
      .select("public_id")
      .eq("id", id)
      .single();

    if (fetchError) throw fetchError;

    // Delete from Cloudinary
    await cloudinary.uploader.destroy(photoData.public_id);

    // Delete from Supabase
    const { error } = await supabase.from("photos").delete().eq("id", id);

    if (error) throw error;
    res.status(200).json({ message: "Photo deleted successfully!" });
  } catch (error) {
    console.error("Error deleting photo:", error);
    res.status(500).json({ error: "Failed to delete photo", details: error.message });
  }
});

// ------------------------------
// VIDEOS ENDPOINTS
// ------------------------------
// Add video
app.post("/api/videos", async (req, res) => {
  try {
    const { title, youtube_url } = req.body;

    const { data, error } = await supabase
      .from("videos")
      .insert([{ title, youtube_url }])
      .select();

    if (error) throw error;
    res.status(200).json({ message: "Video added successfully!", data });
  } catch (error) {
    console.error("Error adding video:", error);
    res.status(500).json({ error: "Failed to add video", details: error.message });
  }
});

// Get all videos
app.get("/api/videos", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("videos")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    console.error("Error fetching videos:", error);
    res.status(500).json({ error: "Failed to fetch videos", details: error.message });
  }
});

// Update video
app.put("/api/videos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { title, youtube_url } = req.body;

    const { data, error } = await supabase
      .from("videos")
      .update({ title, youtube_url })
      .eq("id", id)
      .select();

    if (error) throw error;
    res.status(200).json({ message: "Video updated successfully!", data });
  } catch (error) {
    console.error("Error updating video:", error);
    res.status(500).json({ error: "Failed to update video", details: error.message });
  }
});

// Delete video
app.delete("/api/videos/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("videos").delete().eq("id", id);
    if (error) throw error;
    res.status(200).json({ message: "Video deleted successfully!" });
  } catch (error) {
    console.error("Error deleting video:", error);
    res.status(500).json({ error: "Failed to delete video", details: error.message });
  }
});

// ------------------------------
// CONTACTS (LEADS) ENDPOINTS
// ------------------------------
// Get all contacts
app.get("/api/contacts", async (req, res) => {
  try {
    const { search } = req.query;
    let query = supabase.from("contacts").select("*");

    if (search) {
      query = query.or(
        `name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%,event_type.ilike.%${search}%,message.ilike.%${search}%`
      );
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) throw error;
    res.status(200).json(data);
  } catch (error) {
    console.error("Error fetching contacts:", error);
    res.status(500).json({ error: "Failed to fetch contacts", details: error.message });
  }
});

// Delete contact
app.delete("/api/contacts/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (error) throw error;
    res.status(200).json({ message: "Contact deleted successfully!" });
  } catch (error) {
    console.error("Error deleting contact:", error);
    res.status(500).json({ error: "Failed to delete contact", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log("Environment variables loaded:");
  console.log("  RESEND_API_KEY exists?", !!process.env.RESEND_API_KEY);
  console.log("  SUPABASE_URL exists?", !!process.env.SUPABASE_URL);
  console.log("  CLOUDINARY_CLOUD_NAME exists?", !!process.env.CLOUDINARY_CLOUD_NAME);
});
