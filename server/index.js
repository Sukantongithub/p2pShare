import express from "express";
import http from "http";
import { Server as SocketServer } from "socket.io";
import cors from "cors";
import dotenv from "dotenv";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from project root (one level up when running locally)
dotenv.config({ path: join(__dirname, "..", ".env") });

import uploadRouter from "./routes/upload.js";
import downloadRouter from "./routes/download.js";
import authRouter from "./routes/auth.js";
import usageRouter from "./routes/usage.js";
import clipboardRouter from "./routes/clipboard.js";
import { attachSignaling } from "./signaling.js";
import r2Client, { BUCKET_NAME } from "./s3.js";
import supabase from "./supabase.js";

const app = express();
const PORT = process.env.PORT || 3001;
const EXPIRED_FILE_CLEANUP_INTERVAL_MS = Number(
  process.env.EXPIRED_FILE_CLEANUP_INTERVAL_MS || 10 * 60 * 1000,
);

// CORS: allow local dev + production Vercel URL
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:4173",
  process.env.FRONTEND_URL,
].filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (e.g. curl, Postman) and allowed origins
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true,
  }),
);

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

let expiredCleanupRunning = false;
async function cleanupExpiredFiles() {
  if (expiredCleanupRunning) return;
  expiredCleanupRunning = true;

  try {
    const nowIso = new Date().toISOString();
    const { data: expiredFiles, error } = await supabase
      .from("files")
      .select("id, filename, r2_key")
      .lt("expires_at", nowIso)
      .limit(100);

    // Also clean up expired clipboard entries
    await supabase.from("clipboard_entries").delete().lt("expires_at", nowIso);

    if (error) {
      console.error("Expired cleanup query failed:", error.message);
      return;
    }

    if (!expiredFiles?.length) return;

    for (const file of expiredFiles) {
      try {
        await r2Client.send(
          new DeleteObjectCommand({
            Bucket: BUCKET_NAME,
            Key: file.r2_key,
          }),
        );
      } catch (err) {
        console.error(
          `Expired cleanup R2 delete failed (${file.id}):`,
          err.message,
        );
      }

      const { error: deleteDbError } = await supabase
        .from("files")
        .delete()
        .eq("id", file.id);
      if (deleteDbError) {
        console.error(
          `Expired cleanup DB delete failed (${file.id}):`,
          deleteDbError.message,
        );
      } else {
        console.log(`⌛ Expired file removed: ${file.filename} (${file.id})`);
      }
    }
  } catch (err) {
    console.error("Expired cleanup error:", err.message);
  } finally {
    expiredCleanupRunning = false;
  }
}

setInterval(cleanupExpiredFiles, EXPIRED_FILE_CLEANUP_INTERVAL_MS).unref();
setTimeout(cleanupExpiredFiles, 30_000).unref();

// Health check
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Routes
app.use("/api/upload", uploadRouter);
app.use("/api/download", downloadRouter);
app.use("/api/auth", authRouter);
app.use("/api/usage", usageRouter);
app.use("/api/clipboard", clipboardRouter);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: err.message || "Internal server error" });
});

const httpServer = http.createServer(app);

// Attach Socket.io for Busy Share signaling
const io = new SocketServer(httpServer, {
  cors: {
    origin: allowedOrigins,
    methods: ["GET", "POST"],
    credentials: true,
  },
});
attachSignaling(io);

httpServer.listen(PORT, () => {
  console.log(`✅ P2PShare API + Busy Share signaling running on port ${PORT}`);
});
