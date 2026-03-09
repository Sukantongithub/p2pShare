import express from "express";
import { v4 as uuidv4 } from "uuid";
import supabase from "../supabase.js";
import { optionalAuth } from "../middleware/auth.js";

const router = express.Router();

const PASSCODE_LENGTH = 6;
const PASSCODE_MAX = 10 ** PASSCODE_LENGTH;

// Limits per role
const GUEST_MAX_CHARS = 1_000;
const AUTH_MAX_CHARS = 10_000;
const GUEST_TTL_MS = 15 * 60 * 1000;  // 15 min
const AUTH_TTL_MS  = 30 * 60 * 1000;  // 30 min
const MAX_TTL_MS   = 60 * 60 * 1000;  // 60 min ceiling for paid overrides

function generatePasscode() {
  const code = Math.floor(Math.random() * PASSCODE_MAX);
  return String(code).padStart(PASSCODE_LENGTH, "0");
}

// POST /api/clipboard — open to guests (optionalAuth)
// Guests: 1 000 chars, 15-min TTL
// Registered: 10 000 chars, 30-min TTL (or up to 60 min via ttlMinutes param)
router.post("/", optionalAuth, async (req, res) => {
  try {
    const { text, ttlMinutes } = req.body;
    const isGuest = !req.user;

    const maxChars  = isGuest ? GUEST_MAX_CHARS : AUTH_MAX_CHARS;
    const defaultMs = isGuest ? GUEST_TTL_MS    : AUTH_TTL_MS;

    if (!text || typeof text !== "string") {
      return res.status(400).json({ error: "No text provided" });
    }

    if (text.length > maxChars) {
      return res.status(413).json({
        error: "text_too_long",
        message: isGuest
          ? `Guest clipboard is limited to ${GUEST_MAX_CHARS.toLocaleString()} characters. Sign in for up to ${AUTH_MAX_CHARS.toLocaleString()} characters.`
          : `Text exceeds the ${AUTH_MAX_CHARS.toLocaleString()} character limit.`,
        maxChars,
      });
    }

    const ttlMs = ttlMinutes
      ? Math.min(Number(ttlMinutes) * 60 * 1000, MAX_TTL_MS)
      : defaultMs;

    // Generate a unique passcode
    let passcode;
    let isUnique = false;
    let attempts = 0;
    while (attempts < 12) {
      passcode = generatePasscode();
      const { data: existing, error: lookupError } = await supabase
        .from("clipboard_entries")
        .select("id")
        .eq("passcode", passcode)
        .maybeSingle();

      if (lookupError) throw lookupError;
      if (!existing) {
        isUnique = true;
        break;
      }
      attempts++;
    }

    if (!isUnique) {
      return res.status(500).json({ error: "Failed to generate passcode" });
    }

    const id = uuidv4();
    const expiresAt = new Date(Date.now() + ttlMs).toISOString();

    const { error: dbError } = await supabase.from("clipboard_entries").insert({
      id,
      user_id: req.user?.id ?? null,
      passcode,
      text,
      expires_at: expiresAt,
    });

    if (dbError) {
      console.error("Clipboard DB insert error:", JSON.stringify(dbError, null, 2));
      return res.status(500).json({
        error: "Failed to save clipboard entry",
        detail: dbError.message,
        hint: dbError.hint ?? null,
        code: dbError.code ?? null,
      });
    }

    return res.status(200).json({
      passcode,
      expiresAt,
      expiresInMs: ttlMs,
      charCount: text.length,
      maxChars,
      isGuest,
    });
  } catch (err) {
    console.error("Clipboard save error:", err);
    return res.status(500).json({ error: "Failed to save clipboard", detail: err.message });
  }
});

// GET /api/clipboard/:passcode — public; one-time read, deletes entry on success
router.get("/:passcode", async (req, res) => {
  try {
    const { passcode } = req.params;

    if (!/^\d{6}$/.test(passcode)) {
      return res.status(400).json({ error: "Passcode must be exactly 6 digits" });
    }

    const { data: entry, error } = await supabase
      .from("clipboard_entries")
      .select("*")
      .eq("passcode", passcode)
      .maybeSingle();

    if (error || !entry) {
      return res.status(404).json({ error: "Invalid passcode. No clipboard entry found." });
    }

    if (new Date(entry.expires_at) < new Date()) {
      // Clean up expired entry
      await supabase.from("clipboard_entries").delete().eq("id", entry.id);
      return res.status(410).json({ error: "This clipboard entry has expired." });
    }

    // One-time read: delete the entry immediately
    await supabase.from("clipboard_entries").delete().eq("id", entry.id);

    return res.status(200).json({
      text: entry.text,
      createdAt: entry.created_at,
      expiresAt: entry.expires_at,
    });
  } catch (err) {
    console.error("Clipboard fetch error:", err);
    return res.status(500).json({ error: "Failed to retrieve clipboard", detail: err.message });
  }
});

export default router;
