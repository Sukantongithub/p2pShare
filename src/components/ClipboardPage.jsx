import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../hooks/useAuth";
import { showNotification } from "./Notification";
import {
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
  LockClosedIcon,
  LockOpenIcon,
  PaperAirplaneIcon,
  UserCircleIcon,
  ArrowRightIcon,
} from "@heroicons/react/24/outline";

const API_BASE = import.meta.env.DEV ? "" : import.meta.env.VITE_API_URL || "";
const GUEST_MAX_CHARS = 1_000;
const AUTH_MAX_CHARS  = 10_000;

export default function ClipboardPage() {
  const { user } = useAuth();
  const isGuest = !user;
  const MAX_CHARS = isGuest ? GUEST_MAX_CHARS : AUTH_MAX_CHARS;

  const [activeTab, setActiveTab] = useState("share");

  // ── Share state ──────────────────────────────────────────
  const [text, setText] = useState("");
  const [sharing, setSharing] = useState(false);
  const [shareResult, setShareResult] = useState(null);
  const [shareError, setShareError] = useState("");
  const [copiedPasscode, setCopiedPasscode] = useState(false);

  // ── Receive state ─────────────────────────────────────────
  const [passcode, setPasscode] = useState(Array(6).fill(""));
  const [revealing, setRevealing] = useState(false);
  const [clipInfo, setClipInfo] = useState(null);
  const [receiveError, setReceiveError] = useState("");
  const [copiedText, setCopiedText] = useState(false);
  const inputRefs = useRef([]);

  // ── Share handlers ────────────────────────────────────────
  const handleShare = async () => {
    if (!text.trim()) return;
    setShareError("");
    setSharing(true);
    setShareResult(null);
    try {
      const headers = { "Content-Type": "application/json" };

      if (!isGuest) {
        const { data: { session } } = await supabase.auth.getSession();
        if (session) headers["Authorization"] = `Bearer ${session.access_token}`;
      }

      const res = await fetch(`${API_BASE}/api/clipboard`, {
        method: "POST",
        headers,
        body: JSON.stringify({ text }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || "Failed to share clipboard");

      setShareResult(data);
      showNotification("Clipboard shared!", "success");
    } catch (err) {
      setShareError(err.message);
      showNotification(err.message, "error");
    } finally {
      setSharing(false);
    }
  };

  const copyPasscode = async () => {
    if (!shareResult?.passcode) return;
    await navigator.clipboard.writeText(shareResult.passcode);
    setCopiedPasscode(true);
    showNotification("Passcode copied!", "success");
    setTimeout(() => setCopiedPasscode(false), 2000);
  };

  // ── Receive handlers ──────────────────────────────────────
  const handleDigitChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const updated = [...passcode];
    updated[index] = value.slice(-1);
    setPasscode(updated);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !passcode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "Enter") handleReveal();
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (pasted.length === 6) {
      setPasscode(pasted.split(""));
      inputRefs.current[5]?.focus();
    }
    e.preventDefault();
  };

  const handleReveal = async () => {
    const code = passcode.join("");
    if (code.length !== 6) {
      setReceiveError("Please enter all 6 digits");
      return;
    }
    setReceiveError("");
    setRevealing(true);
    setClipInfo(null);
    try {
      const res = await fetch(`${API_BASE}/api/clipboard/${code}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Invalid passcode");
      setClipInfo(data);
      showNotification("Clipboard revealed!", "success");
    } catch (err) {
      setReceiveError(err.message);
      showNotification(err.message, "error");
    } finally {
      setRevealing(false);
    }
  };

  const copyClipText = async () => {
    if (!clipInfo?.text) return;
    await navigator.clipboard.writeText(clipInfo.text);
    setCopiedText(true);
    showNotification("Text copied!", "success");
    setTimeout(() => setCopiedText(false), 2000);
  };

  // ── Helpers ───────────────────────────────────────────────
  const resetShare = () => {
    setText("");
    setShareResult(null);
    setShareError("");
    setCopiedPasscode(false);
  };

  const resetReceive = () => {
    setPasscode(Array(6).fill(""));
    setClipInfo(null);
    setReceiveError("");
    setCopiedText(false);
    setTimeout(() => inputRefs.current[0]?.focus(), 50);
  };

  const charPct = Math.min((text.length / MAX_CHARS) * 100, 100);

  return (
    <div className="min-h-screen light-mesh bg-linear-to-b from-slate-50 to-teal-50/40 dark:bg-slate-950 transition-colors duration-300">
      <div className="max-w-2xl mx-auto px-4 py-10 sm:py-12 pb-24 sm:pb-12">

        {/* Heading */}
        <div className="text-center mb-8 fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-teal-100 dark:bg-teal-500/10 border border-teal-200 dark:border-teal-500/20 rounded-full text-teal-600 dark:text-teal-400 text-sm font-medium mb-4">
            <ClipboardDocumentIcon className="w-4 h-4" />
            Clipboard Share
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-3">
            Share text,{" "}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-teal-500 to-cyan-500">
              instantly
            </span>
          </h1>
          <p className="text-slate-700 dark:text-slate-400 text-sm sm:text-base">
            Paste a link, code snippet, or note. Receive it anywhere with a{" "}
            <span className="font-medium text-teal-500">6-digit passcode</span>.
          </p>
        </div>

        {/* ── Guest notice ── */}
        {isGuest && (
          <div className="mb-5 p-4 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 fade-in">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-amber-800 dark:text-amber-300 text-sm font-semibold">
                  🚀 Guest Mode
                </p>
                <p className="text-amber-700 dark:text-amber-400/80 text-xs mt-0.5">
                  1,000 chars · 15 min TTL · Sign in for 10,000 chars & 30 min
                </p>
              </div>
              <Link
                to="/login"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold transition-all duration-200 shrink-0"
              >
                <UserCircleIcon className="w-3.5 h-3.5" />
                Sign in
                <ArrowRightIcon className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 bg-white dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl mb-5 shadow-sm fade-in">
          {[
            { id: "share", label: "Share", icon: PaperAirplaneIcon },
            { id: "receive", label: "Receive", icon: LockOpenIcon },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === id
                  ? "bg-linear-to-r from-teal-600 to-cyan-600 text-white shadow-md shadow-teal-500/25"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {/* ──────────────── SHARE TAB ──────────────── */}
        {activeTab === "share" && (
          <div className="fade-in">
            {!shareResult ? (
              <div className="bg-white dark:bg-white/3 border border-slate-300 dark:border-white/8 rounded-2xl p-6 shadow-md dark:shadow-2xl transition-colors duration-300">
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">
                  Your text
                </label>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value.slice(0, MAX_CHARS))}
                  placeholder="Paste a link, code snippet, or any note…"
                  rows={7}
                  className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-600 p-4 text-sm font-mono focus:outline-none focus:border-teal-400 dark:focus:border-teal-500/60 focus:bg-white dark:focus:bg-white/8 transition-all duration-200 resize-none"
                />

                {/* Character bar */}
                <div className="flex items-center justify-between mt-2 mb-4">
                  <div className="flex-1 h-1 bg-slate-100 dark:bg-white/8 rounded-full overflow-hidden mr-3">
                    <div
                      className={`h-full rounded-full transition-all duration-300 ${
                        charPct > 90
                          ? "bg-linear-to-r from-rose-500 to-orange-500"
                          : charPct > 70
                          ? "bg-linear-to-r from-amber-500 to-orange-400"
                          : "bg-linear-to-r from-teal-500 to-cyan-500"
                      }`}
                      style={{ width: `${charPct}%` }}
                    />
                  </div>
                  <span className={`text-xs tabular-nums shrink-0 ${charPct > 90 ? "text-rose-500" : "text-slate-500 dark:text-slate-500"}`}>
                    {text.length.toLocaleString()} / {MAX_CHARS.toLocaleString()}
                  </span>
                </div>

                {shareError && (
                  <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-sm">
                    ⚠ {shareError}
                  </div>
                )}

                <button
                  onClick={handleShare}
                  disabled={sharing || !text.trim()}
                  className="w-full py-3.5 font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 bg-linear-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 disabled:opacity-50 disabled:cursor-not-allowed text-white border border-teal-300/60 dark:border-transparent shadow-sm dark:shadow-lg dark:shadow-teal-500/25"
                >
                  {sharing ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Sharing…
                    </>
                  ) : (
                    <>
                      <PaperAirplaneIcon className="w-5 h-5" />
                      Share &amp; Generate Passcode
                    </>
                  )}
                </button>
              </div>
            ) : (
              /* ── Success card ── */
              <div className="bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl p-6 fade-in">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  <p className="text-emerald-700 dark:text-emerald-400 font-semibold">
                    Clipboard shared!
                  </p>
                  {shareResult.isGuest && (
                    <span className="ml-auto px-2 py-0.5 rounded-full bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 text-[10px] font-bold uppercase tracking-wide border border-amber-200 dark:border-amber-500/30">
                      Guest · 15 min
                    </span>
                  )}
                </div>

                {/* One-time warning */}
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl text-amber-700 dark:text-amber-400 text-xs font-medium mb-5">
                  ⚡ This text can be revealed{" "}
                  <span className="font-bold underline">once only</span> — it self-destructs after reading.
                </div>

                {/* Passcode digits */}
                <div className="text-center mb-4">
                  <p className="text-slate-500 dark:text-slate-400 text-sm mb-2 flex items-center justify-center gap-1">
                    <LockClosedIcon className="w-4 h-4" /> Your 6-Digit Passcode
                  </p>
                  <div className="flex items-center justify-center gap-2 flex-wrap">
                    {shareResult.passcode.split("").map((digit, i) => (
                      <div
                        key={i}
                        className="w-12 h-14 rounded-xl bg-slate-100 dark:bg-white/8 border border-slate-200 dark:border-white/15 flex items-center justify-center text-2xl font-bold text-slate-900 dark:text-white float-anim"
                        style={{ animationDelay: `${i * 0.08}s` }}
                      >
                        {digit}
                      </div>
                    ))}
                  </div>
                </div>

                <button
                  onClick={copyPasscode}
                  className={`w-full py-3 rounded-xl font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 mb-3 ${
                    copiedPasscode
                      ? "bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                      : "bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300"
                  }`}
                >
                  {copiedPasscode ? (
                    <><ClipboardDocumentCheckIcon className="w-4 h-4" /> Copied!</>
                  ) : (
                    <><ClipboardDocumentIcon className="w-4 h-4" /> Copy Passcode</>
                  )}
                </button>

                <button
                  onClick={resetShare}
                  className="w-full py-2.5 rounded-xl font-medium text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  Share another
                </button>

                <p className="text-center text-slate-600 dark:text-slate-500 text-xs mt-3">
                  Share this at <span className="text-teal-500">/clipboard</span> → Receive tab
                </p>
              </div>
            )}
          </div>
        )}

        {/* ──────────────── RECEIVE TAB ──────────────── */}
        {activeTab === "receive" && (
          <div className="fade-in">
            {!clipInfo ? (
              <div className="bg-white dark:bg-white/3 border border-slate-300 dark:border-white/8 rounded-2xl p-5 sm:p-6 shadow-md dark:shadow-2xl transition-colors duration-300">
                <p className="text-slate-700 dark:text-slate-400 text-sm text-center mb-4">
                  Enter 6-digit passcode
                </p>

                <div className="flex gap-2 sm:gap-3 justify-center mb-5" onPaste={handlePaste}>
                  {passcode.map((digit, i) => (
                    <input
                      key={i}
                      ref={(el) => (inputRefs.current[i] = el)}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handleDigitChange(i, e.target.value)}
                      onKeyDown={(e) => handleKeyDown(i, e)}
                      className={`
                        w-10 h-12 sm:w-14 sm:h-16 text-center text-lg sm:text-2xl font-bold rounded-xl border
                        transition-all duration-200 text-slate-900 dark:text-white outline-none
                        ${
                          digit
                            ? "border-teal-400 bg-teal-50 dark:bg-teal-500/10 dark:border-teal-500/60 text-teal-600 dark:text-teal-300"
                            : "border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 focus:border-teal-400 dark:focus:border-teal-500/50 focus:bg-teal-50 dark:focus:bg-teal-500/5"
                        }
                      `}
                    />
                  ))}
                </div>

                {receiveError && (
                  <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-sm text-center">
                    ⚠ {receiveError}
                  </div>
                )}

                <button
                  onClick={handleReveal}
                  disabled={revealing || passcode.some((d) => !d)}
                  className="w-full py-3.5 bg-linear-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 disabled:opacity-55 disabled:cursor-not-allowed text-white font-semibold rounded-xl border border-teal-300/60 dark:border-transparent shadow-sm dark:shadow-lg dark:shadow-teal-500/25 transition-all duration-200 flex items-center justify-center gap-2"
                >
                  {revealing ? (
                    <span className="flex items-center gap-2">
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Revealing…
                    </span>
                  ) : (
                    <><LockOpenIcon className="w-5 h-5" /> Reveal Text</>
                  )}
                </button>
              </div>
            ) : (
              /* ── Revealed text card ── */
              <div className="space-y-4 fade-in">
                <div className="bg-white dark:bg-white/3 border border-slate-300 dark:border-white/10 rounded-2xl p-5 shadow-sm transition-colors duration-300">
                  <div className="flex items-center gap-2 mb-3">
                    <div className="w-2 h-2 rounded-full bg-teal-500 animate-pulse" />
                    <p className="text-teal-700 dark:text-teal-400 font-semibold text-sm">
                      Clipboard revealed!
                    </p>
                    <span className="ml-auto text-xs text-slate-400">
                      {new Date(clipInfo.createdAt).toLocaleString()}
                    </span>
                  </div>

                  <pre className="w-full rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 text-slate-900 dark:text-slate-100 p-4 text-sm font-mono whitespace-pre-wrap break-words max-h-64 overflow-y-auto">
                    {clipInfo.text}
                  </pre>
                </div>

                <button
                  onClick={copyClipText}
                  className={`w-full py-3 rounded-xl font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                    copiedText
                      ? "bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                      : "bg-linear-to-r from-teal-600 to-cyan-600 hover:from-teal-500 hover:to-cyan-500 text-white border border-teal-300/60 dark:border-transparent shadow-sm dark:shadow-lg dark:shadow-teal-500/25"
                  }`}
                >
                  {copiedText ? (
                    <><ClipboardDocumentCheckIcon className="w-4 h-4" /> Copied!</>
                  ) : (
                    <><ClipboardDocumentIcon className="w-4 h-4" /> Copy Text</>
                  )}
                </button>

                <button
                  onClick={resetReceive}
                  className="w-full py-2.5 rounded-xl font-medium text-sm text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                >
                  Reveal another
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
