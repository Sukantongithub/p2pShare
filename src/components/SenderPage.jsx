import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../hooks/useAuth";
import DragDropUpload from "./DragDropUpload";
import ProgressBar from "./ProgressBar";
import UpgradeModal from "./UpgradeModal";
import { showNotification } from "./Notification";
import { useUsage } from "../hooks/useUsage";
import {
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
  CloudArrowUpIcon,
  LockClosedIcon,
  ChartBarIcon,
  ArrowRightIcon,
  UserCircleIcon,
} from "@heroicons/react/24/outline";

const API_BASE = import.meta.env.DEV ? "" : import.meta.env.VITE_API_URL || "";
const FREE_LIMIT = 8 * 1024 ** 3;      // 8 GB for registered users
const GUEST_LIMIT = 500 * 1024 ** 2;   // 500 MB for guests

function fmtBytes(bytes) {
  if (!bytes) return "0 B";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function SenderPage() {
  const { user } = useAuth();
  const isGuest = !user;

  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [showUpgrade, setShowUpgrade] = useState(false);

  const { usage, refetch: refetchUsage } = useUsage();

  const usedBytes = usage?.bytesUsed ?? 0;
  const usedPct = Math.min((usedBytes / FREE_LIMIT) * 100, 100);
  const isAtLimit = !isGuest && usedBytes >= FREE_LIMIT;

  const handleUpload = async () => {
    if (!file) return;
    if (isAtLimit) {
      setShowUpgrade(true);
      return;
    }

    setError("");
    setUploading(true);
    setProgress(0);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const xhr = new XMLHttpRequest();
      xhr.open("POST", `${API_BASE}/api/upload`);

      // Only attach auth header for signed-in users
      if (!isGuest) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          xhr.setRequestHeader("Authorization", `Bearer ${session.access_token}`);
        }
      }

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress((e.loaded / e.total) * 100);
      };

      xhr.onload = () => {
        setUploading(false);
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          setResult(data);
          setFile(null);
          showNotification("File uploaded!", "success");
          if (!isGuest) refetchUsage();
        } else if (xhr.status === 402) {
          setShowUpgrade(true);
        } else {
          const data = JSON.parse(xhr.responseText);
          const msg = data.message || data.error || "Upload failed";
          setError(msg);
          showNotification(msg, "error");
        }
      };

      xhr.onerror = () => {
        setUploading(false);
        setError("Network error during upload");
        showNotification("Network error during upload", "error");
      };

      xhr.send(formData);
    } catch (err) {
      setUploading(false);
      setError(err.message);
      showNotification(err.message, "error");
    }
  };

  const copyPasscode = async () => {
    if (!result?.passcode) return;
    await navigator.clipboard.writeText(result.passcode);
    setCopied(true);
    showNotification("Passcode copied!", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen light-mesh bg-linear-to-b from-slate-50 to-indigo-50/40 dark:bg-slate-950 transition-colors duration-300">
      {showUpgrade && (
        <UpgradeModal onClose={() => setShowUpgrade(false)} usage={usage} />
      )}

      <div className="max-w-2xl mx-auto px-4 py-10 sm:py-12 pb-24 sm:pb-12">
        {/* Heading */}
        <div className="text-center mb-8 fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 rounded-full text-indigo-600 dark:text-indigo-400 text-sm font-medium mb-4">
            <CloudArrowUpIcon className="w-4 h-4" />
            Send a File
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-3">
            Share anything,{" "}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-indigo-500 to-purple-500">
              securely
            </span>
          </h1>
          <p className="text-slate-700 dark:text-slate-400 text-sm sm:text-base">
            {isGuest ? (
              <>
                Upload files up to{" "}
                <span className="font-medium text-amber-500">500 MB</span> as a
                guest. Files are{" "}
                <span className="font-medium text-rose-500 dark:text-rose-400">
                  permanently deleted
                </span>{" "}
                after the first download.
              </>
            ) : (
              <>
                Upload files up to{" "}
                <span className="font-medium text-indigo-500">8 GB</span>. Files
                are{" "}
                <span className="font-medium text-rose-500 dark:text-rose-400">
                  permanently deleted
                </span>{" "}
                after the first download.
              </>
            )}
          </p>
        </div>

        {/* ── Guest banner ── */}
        {isGuest && (
          <div className="mb-5 p-4 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 fade-in">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-amber-800 dark:text-amber-300 text-sm font-semibold">
                  🚀 Guest Mode
                </p>
                <p className="text-amber-700 dark:text-amber-400/80 text-xs mt-0.5">
                  500 MB limit · 1 download · 30 min expiry · No upload history
                </p>
              </div>
              <Link
                to="/login"
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold transition-all duration-200 shrink-0"
              >
                <UserCircleIcon className="w-3.5 h-3.5" />
                Sign in for 8 GB
                <ArrowRightIcon className="w-3 h-3" />
              </Link>
            </div>
          </div>
        )}

        {/* ── Monthly usage bar (authenticated only) ── */}
        {!isGuest && usage && (
          <div
            className={`mb-5 p-4 rounded-xl border transition-colors duration-300 ${
              isAtLimit
                ? "bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/30"
                : "bg-white dark:bg-white/3 border-slate-300 dark:border-white/8 shadow-sm"
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-sm font-semibold text-slate-800 dark:text-slate-300">
                <ChartBarIcon className="w-4 h-4 text-indigo-500" />
                Monthly Storage
              </span>
              <span
                className={`text-sm font-semibold ${isAtLimit ? "text-rose-500" : "text-slate-700 dark:text-slate-300"}`}
              >
                {fmtBytes(usedBytes)} / 8 GB
              </span>
            </div>
            <div className="w-full h-2 bg-slate-100 dark:bg-white/8 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${
                  isAtLimit
                    ? "bg-linear-to-r from-rose-500 to-orange-500"
                    : usedPct > 75
                      ? "bg-linear-to-r from-amber-500 to-orange-400"
                      : "bg-linear-to-r from-indigo-500 to-purple-500"
                }`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            {isAtLimit && (
              <p className="text-xs text-rose-500 dark:text-rose-400 mt-1.5">
                Storage full.{" "}
                <button
                  onClick={() => setShowUpgrade(true)}
                  className="underline font-medium hover:text-rose-600"
                >
                  Upgrade to continue
                </button>
              </p>
            )}
          </div>
        )}

        {/* Upload card */}
        <div className="bg-white dark:bg-white/3 border border-slate-300 dark:border-white/8 rounded-2xl p-6 fade-in shadow-md dark:shadow-2xl transition-colors duration-300">
          <DragDropUpload
            onFileSelect={setFile}
            disabled={uploading || isAtLimit}
            maxBytes={isGuest ? GUEST_LIMIT : FREE_LIMIT}
          />

          {file && !uploading && (
            <button
              onClick={handleUpload}
              disabled={isAtLimit}
              className={`mt-4 w-full py-3.5 font-semibold rounded-xl transition-all duration-200 flex items-center justify-center gap-2 ${
                isAtLimit
                  ? "bg-slate-200 dark:bg-white/5 text-slate-400 cursor-not-allowed"
                  : "bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white border border-indigo-300/60 dark:border-transparent shadow-sm dark:shadow-lg dark:shadow-indigo-500/25"
              }`}
            >
              {isAtLimit ? (
                <>
                  <ChartBarIcon className="w-5 h-5" /> Storage limit reached —
                  Upgrade
                </>
              ) : (
                <>
                  <CloudArrowUpIcon className="w-5 h-5" /> Upload &amp; Generate
                  Passcode
                </>
              )}
            </button>
          )}

          {uploading && (
            <div className="mt-4">
              <ProgressBar progress={progress} />
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-sm">
              ⚠ {error}
            </div>
          )}
        </div>

        {/* Success card */}
        {result && (
          <div className="mt-6 bg-emerald-50 dark:bg-emerald-500/5 border border-emerald-200 dark:border-emerald-500/20 rounded-2xl p-6 fade-in">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-emerald-700 dark:text-emerald-400 font-semibold">
                File uploaded successfully!
              </p>
            </div>

            <p className="text-slate-700 dark:text-slate-400 text-sm mb-1 truncate">
              {result.filename}
            </p>
            <p className="text-slate-500 dark:text-slate-500 text-xs mb-3">
              {fmtBytes(result.size)}
            </p>

            {/* One-time download badge */}
            <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-semibold mb-4">
              🗑️ This file will be{" "}
              <span className="underline">permanently deleted</span> after the
              first download
            </div>

            {/* Passcode digits */}
            <div className="text-center mb-4">
              <p className="text-slate-500 dark:text-slate-400 text-sm mb-2 flex items-center justify-center gap-1">
                <LockClosedIcon className="w-4 h-4" /> Your 6-Digit Passcode
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {result.passcode.split("").map((digit, i) => (
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
              className={`w-full py-3 rounded-xl font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                copied
                  ? "bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-400"
                  : "bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300"
              }`}
            >
              {copied ? (
                <>
                  <ClipboardDocumentCheckIcon className="w-4 h-4" /> Copied!
                </>
              ) : (
                <>
                  <ClipboardDocumentIcon className="w-4 h-4" /> Copy Passcode
                </>
              )}
            </button>

            {isGuest && (
              <div className="mt-4 p-3 bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl text-center">
                <p className="text-amber-700 dark:text-amber-400 text-xs">
                  Want to track your uploads?{" "}
                  <Link
                    to="/login"
                    className="font-semibold underline hover:text-amber-600"
                  >
                    Sign in for history &amp; 8 GB uploads →
                  </Link>
                </p>
              </div>
            )}

            <p className="text-center text-slate-600 dark:text-slate-500 text-xs mt-3">
              Share at <span className="text-indigo-500">/receive</span>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
