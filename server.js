import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { v2 as cloudinary } from "cloudinary";
import multer from "multer";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import compression from "compression";
import { z } from "zod";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================
// 1. SECURITY MIDDLEWARE FIRST!
// ========================================

// Helmet for security headers
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https://res.cloudinary.com"],
            frameSrc: ["'self'", "https://www.youtube.com"],
        },
    },
}));

// Compression
app.use(compression());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: "Too many requests, please try again later",
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// Strict CORS
const allowedOrigins = [
    process.env.FRONTEND_URL || "http://localhost:5173",
    "http://localhost:5173",
    "http://localhost:3000",
    "https://weddingtree.vercel.app",
];

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                console.warn(`Blocked by CORS: ${origin}`);
                callback(new Error("Not allowed by CORS"));
            }
        },
        credentials: true,
    })
);

// Request size limits
app.use(express.json({ limit: "10kb" }));
app.use(express.urlencoded({ extended: true, limit: "10kb" }));

// ========================================
// 2. INITIALIZE SERVICES
// ========================================

const resend = new Resend(process.env.RESEND_API_KEY);
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY // Service role for admin operations
);

cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Configure multer for file uploads (in-memory, size limit)
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB max
    },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/jpg"];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Invalid file type. Only JPEG, PNG, and WEBP are allowed."));
        }
    },
});

// ========================================
// 3. VALIDATION SCHEMAS
// ========================================

const ContactFormSchema = z.object({
    name: z.string().min(1, "Name is required").max(255),
    email: z.string().email("Invalid email address").max(255),
    phone: z.string().max(50).optional().or(z.literal("")),
    eventType: z.string().max(100).optional().or(z.literal("")),
    message: z.string().max(1000).optional().or(z.literal("")),
});

const PhotoSchema = z.object({
    title: z.string().min(1).max(255),
    category: z.string().min(1).max(100),
});

const VideoSchema = z.object({
    title: z.string().min(1).max(255),
    youtube_url: z.string().url("Must be a valid URL"),
});

const SearchQuerySchema = z.object({
    search: z.string().max(100).regex(/^[a-zA-Z0-9@.\s-]*$/, "Only alphanumeric characters, spaces, @, ., and - allowed").optional().or(z.literal("")),
});

// ========================================
// 4. AUTHENTICATION MIDDLEWARE
// ========================================

const authenticateAdmin = async (req, res, next) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer ")) {
            console.warn("Unauthorized: No token provided");
            return res.status(401).json({ error: "Unauthorized" });
        }

        const token = authHeader.split(" ")[1];
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
            console.warn("Unauthorized: Invalid token");
            return res.status(401).json({ error: "Unauthorized" });
        }

        // Get user role from profiles table
        const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", user.id)
            .single();

        req.user = { id: user.id, role: profile?.role || "editor" };
        next();
    } catch (error) {
        console.error("Auth error:", error);
        return res.status(401).json({ error: "Unauthorized" });
    }
};

// ========================================
// 5. HELPER: SAFE ERROR HANDLER
// ========================================

const safeErrorHandler = (err, req, res, next) => {
    console.error("Error:", err);
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({ error: "File too large. Max 10MB." });
    }
    if (err instanceof z.ZodError) {
        return res.status(400).json({
            error: "Validation failed",
            details: err.issues.map((issue) => issue.message),
        });
    }
    res.status(500).json({
        error: "Internal server error",
    });
};

// ========================================
// 6. PUBLIC ENDPOINTS
// ========================================

app.get("/", (req, res) => {
    res.json({ message: "The Wedding Tree API" });
});

// Get all photos (public)
app.get("/api/photos", async (req, res, next) => {
    try {
        const { data, error } = await supabase
            .from("photos")
            .select("*")
            .order("created_at", { ascending: false });
        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        next(error);
    }
});

// Get all videos (public)
app.get("/api/videos", async (req, res, next) => {
    try {
        const { data, error } = await supabase
            .from("videos")
            .select("*")
            .order("created_at", { ascending: false });
        if (error) throw error;
        res.status(200).json(data);
    } catch (error) {
        next(error);
    }
});

// Contact form endpoint (public)
app.post("/api/contact", async (req, res, next) => {
    try {
        const validatedData = ContactFormSchema.parse(req.body);

        // 1. Save to Supabase
        const { data, error: dbError } = await supabase
            .from("contacts")
            .insert([{
                name: validatedData.name,
                email: validatedData.email,
                phone: validatedData.phone,
                event_type: validatedData.eventType,
                message: validatedData.message,
            }])
            .select();
        if (dbError) throw dbError;

        // 2. Send email to owner
        try {
            await resend.emails.send({
                from: "The Wedding Tree <onboarding@resend.dev>",
                to: process.env.RECEIVER_EMAIL,
                subject: "New Contact Form Submission",
                html: `
                    <h2>New Lead</h2>
                    <p><strong>Name:</strong> ${validatedData.name}</p>
                    <p><strong>Email:</strong> ${validatedData.email}</p>
                    <p><strong>Phone:</strong> ${validatedData.phone || "Not provided"}</p>
                    <p><strong>Event:</strong> ${validatedData.eventType || "Not provided"}</p>
                    <p><strong>Message:</strong> ${validatedData.message || "No message"}</p>
                `,
            });
        } catch (emailErr) {
            console.error("Email failed, but contact saved:", emailErr);
        }

        // 3. Send thank you to user
        try {
            await resend.emails.send({
                from: "The Wedding Tree <onboarding@resend.dev>",
                to: validatedData.email,
                subject: "Thank You for Contacting The Wedding Tree",
                html: `
                    <h2>Dear ${validatedData.name},</h2>
                    <p>Thank you for reaching out to us! We've received your message and will contact you soon.</p>
                `,
            });
        } catch (emailErr) {
            console.error("Thank you email failed:", emailErr);
        }

        res.status(200).json({ message: "Contact submitted successfully" });
    } catch (error) {
        next(error);
    }
});

// ========================================
// 7. ADMIN ENDPOINTS (PROTECTED)
// ========================================

// Upload photo (admin only)
app.post(
    "/api/photos",
    authenticateAdmin,
    upload.single("image"),
    async (req, res, next) => {
        try {
            if (req.user.role !== "admin") {
                return res.status(403).json({ error: "Forbidden: Only admins can create photos" });
            }
            
            if (!req.file) return res.status(400).json({ error: "Image file is required" });

            const { title, category } = PhotoSchema.parse(req.body);

            // Upload to Cloudinary
            const result = await new Promise((resolve, reject) => {
                const uploadStream = cloudinary.uploader.upload_stream(
                    { folder: "theweddingtree" },
                    (error, res) => {
                        if (error) reject(error);
                        else resolve(res);
                    }
                );
                uploadStream.end(req.file.buffer);
            });

            // Save to Supabase
            const { data, error } = await supabase
                .from("photos")
                .insert([{
                    title,
                    category,
                    image_url: result.secure_url,
                    public_id: result.public_id,
                    created_by: req.user.id,
                }])
                .select();
            if (error) throw error;

            console.log(`[ADMIN] Photo uploaded by user: ${req.user.id}`);
            res.status(200).json({ message: "Photo uploaded successfully", data });
        } catch (error) {
            next(error);
        }
    }
);

// Update photo (admin only)
app.put(
    "/api/photos/:id",
    authenticateAdmin,
    async (req, res, next) => {
        try {
            if (req.user.role !== "admin") {
                return res.status(403).json({ error: "Forbidden: Only admins can update photos" });
            }
            
            const { id } = req.params;
            const { title, category } = PhotoSchema.parse(req.body);

            const { data, error } = await supabase
                .from("photos")
                .update({ title, category })
                .eq("id", id)
                .select();
            if (error) throw error;

            console.log(`[ADMIN] Photo updated by user: ${req.user.id}`);
            res.status(200).json({ message: "Photo updated successfully", data });
        } catch (error) {
            next(error);
        }
    }
);

// Delete photo (admin only)
app.delete(
    "/api/photos/:id",
    authenticateAdmin,
    async (req, res, next) => {
        try {
            if (req.user.role !== "admin") {
                return res.status(403).json({ error: "Forbidden: Only admins can delete photos" });
            }

            const { id } = req.params;

            // Get photo first
            const { data: photo, error: fetchErr } = await supabase
                .from("photos")
                .select("public_id")
                .eq("id", id)
                .single();
            if (fetchErr) throw fetchErr;

            // Delete from Cloudinary
            await cloudinary.uploader.destroy(photo.public_id);

            // Delete from Supabase
            const { error } = await supabase.from("photos").delete().eq("id", id);
            if (error) throw error;

            console.log(`[ADMIN] Photo deleted by admin: ${req.user.id}`);
            res.status(200).json({ message: "Photo deleted successfully" });
        } catch (error) {
            next(error);
        }
    }
);

// Add video (admin only)
app.post(
    "/api/videos",
    authenticateAdmin,
    async (req, res, next) => {
        try {
            if (req.user.role !== "admin") {
                return res.status(403).json({ error: "Forbidden: Only admins can create videos" });
            }
            
            const { title, youtube_url } = VideoSchema.parse(req.body);

            const { data, error } = await supabase
                .from("videos")
                .insert([{
                    title,
                    youtube_url,
                    created_by: req.user.id,
                }])
                .select();
            if (error) throw error;

            console.log(`[ADMIN] Video added by user: ${req.user.id}`);
            res.status(200).json({ message: "Video added successfully", data });
        } catch (error) {
            next(error);
        }
    }
);

// Update video (admin only)
app.put(
    "/api/videos/:id",
    authenticateAdmin,
    async (req, res, next) => {
        try {
            if (req.user.role !== "admin") {
                return res.status(403).json({ error: "Forbidden: Only admins can update videos" });
            }
            
            const { id } = req.params;
            const { title, youtube_url } = VideoSchema.parse(req.body);

            const { data, error } = await supabase
                .from("videos")
                .update({ title, youtube_url })
                .eq("id", id)
                .select();
            if (error) throw error;

            console.log(`[ADMIN] Video updated by user: ${req.user.id}`);
            res.status(200).json({ message: "Video updated successfully", data });
        } catch (error) {
            next(error);
        }
    }
);

// Delete video (admin only)
app.delete(
    "/api/videos/:id",
    authenticateAdmin,
    async (req, res, next) => {
        try {
            if (req.user.role !== "admin") {
                return res.status(403).json({ error: "Forbidden: Only admins can delete videos" });
            }

            const { id } = req.params;
            const { error } = await supabase.from("videos").delete().eq("id", id);
            if (error) throw error;

            console.log(`[ADMIN] Video deleted by admin: ${req.user.id}`);
            res.status(200).json({ message: "Video deleted successfully" });
        } catch (error) {
            next(error);
        }
    }
);

// Get contact leads (admin only)
app.get(
    "/api/contacts",
    authenticateAdmin,
    async (req, res, next) => {
        try {
            const { search } = SearchQuerySchema.parse(req.query);
            let query = supabase
                .from("contacts")
                .select("*")
                .order("created_at", { ascending: false });

            if (search && search.trim()) {
                const sanitizedSearch = search.trim().replace(/'/g, "''"); // Escape single quotes for SQL
                query = query.or(
                    `name.ilike.%${sanitizedSearch}%,email.ilike.%${sanitizedSearch}%,phone.ilike.%${sanitizedSearch}%`
                );
            }

            const { data, error } = await query;
            if (error) throw error;

            res.status(200).json(data);
        } catch (error) {
            next(error);
        }
    }
);

// Delete contact lead (admin only)
app.delete(
    "/api/contacts/:id",
    authenticateAdmin,
    async (req, res, next) => {
        try {
            if (req.user.role !== "admin") {
                return res.status(403).json({ error: "Forbidden: Only admins can delete leads" });
            }

            const { id } = req.params;
            const { error } = await supabase.from("contacts").delete().eq("id", id);
            if (error) throw error;

            console.log(`[ADMIN] Contact lead deleted by admin: ${req.user.id}`);
            res.status(200).json({ message: "Lead deleted successfully" });
        } catch (error) {
            next(error);
        }
    }
);

// ========================================
// GLOBAL ERROR HANDLER
// ========================================
app.use(safeErrorHandler);

// ========================================
// START SERVER
// ========================================
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log("Security checks loaded!");
    console.log(`Allowed origins: ${allowedOrigins.join(", ")}`);
});
