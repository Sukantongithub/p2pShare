import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../supabaseClient";
import { useAuth } from "../hooks/useAuth";
import DragDropUpload from "./DragDropUpload";
import ProgressBar from "./ProgressBar";
import UpgradeModal from "./UpgradeModal";
import { showNotification } from "./Notification";
import { useUsage } from "../hooks/useUsage";
import axios from "axios";
import {
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
  CloudArrowUpIcon,
  CloudArrowDownIcon,
  LockClosedIcon,
  LockOpenIcon,
  ChartBarIcon,
  ArrowRightIcon,
  UserCircleIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";

const API_BASE = import.meta.env.DEV ? "" : import.meta.env.VITE_API_URL || "";
const FREE_LIMIT = 8 * 1024 ** 3; // 8 GB — registered
const GUEST_LIMIT = 500 * 1024 ** 2; // 500 MB — guest

function fmtBytes(bytes) {
  if (!bytes) return "0 B";
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

// ─────────────────────────────────────────────
//  SEND TAB
// ─────────────────────────────────────────────
function SendTab({ user }) {
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

      if (!isGuest) {
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (session) {
          xhr.setRequestHeader(
            "Authorization",
            `Bearer ${session.access_token}`,
          );
        }
      }

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) setProgress((e.loaded / e.total) * 100);
      };

      xhr.onload = () => {
        setUploading(false);
        let data = {};
        try {
          data = xhr.responseText ? JSON.parse(xhr.responseText) : {};
        } catch {
          data = {};
        }

        if (xhr.status === 200) {
          setResult(data);
          setFile(null);
          showNotification("File uploaded!", "success");
          if (!isGuest) refetchUsage();
        } else if (xhr.status === 402) {
          setShowUpgrade(true);
        } else {
          const msg = data.message || data.error || "Upload failed";
          setError(msg);
          showNotification(msg, "error");
        }
      };

      xhr.onerror = () => {
        setUploading(false);
        setError("Network error");
        showNotification("Network error", "error");
      };

      xhr.send(formData);
    } catch (err) {
      setUploading(false);
      setError(err.message);
      showNotification(err.message, "error");
    }
  };

  const copyPasscode = async () => {
    await navigator.clipboard.writeText(result.passcode);
    setCopied(true);
    showNotification("Passcode copied!", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      {showUpgrade && (
        <UpgradeModal onClose={() => setShowUpgrade(false)} usage={usage} />
      )}

      {/* Guest banner */}
      {isGuest && (
        <div className="mb-5 p-4 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10 fade-in">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-amber-800 dark:text-amber-300 text-sm font-semibold">
                🚀 Guest Mode
              </p>
              <p className="text-amber-700 dark:text-amber-400/80 text-xs mt-0.5">
                500 MB limit · 1 download · 30 min expiry · No history
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

      {/* Monthly usage bar (auth only) */}
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
              <ChartBarIcon className="w-4 h-4 text-indigo-500" /> Monthly
              Storage
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
      <div className="bg-white dark:bg-white/3 border border-slate-300 dark:border-white/8 rounded-2xl p-6 shadow-md dark:shadow-2xl transition-colors duration-300">
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

          <div className="flex items-center gap-2 px-3 py-2 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-xs font-semibold mb-4">
            🗑️ Permanently deleted after the first download
          </div>

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
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  RECEIVE TAB
// ─────────────────────────────────────────────
function ReceiveTab() {
  const [passcode, setPasscode] = useState(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [fileInfo, setFileInfo] = useState(null);
  const [error, setError] = useState("");
  const inputRefs = useRef([]);

  const handleDigitChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const updated = [...passcode];
    updated[index] = value.slice(-1);
    setPasscode(updated);
    if (value && index < 5) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === "Backspace" && !passcode[index] && index > 0)
      inputRefs.current[index - 1]?.focus();
    if (e.key === "Enter") handleFetch();
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, 6);
    if (pasted.length === 6) {
      setPasscode(pasted.split(""));
      inputRefs.current[5]?.focus();
    }
    e.preventDefault();
  };

  const handleFetch = async () => {
    const code = passcode.join("");
    if (code.length !== 6) {
      setError("Please enter all 6 digits");
      return;
    }
    setError("");
    setLoading(true);
    setFileInfo(null);
    try {
      const { data } = await axios.get(`${API_BASE}/api/download/${code}`);
      setFileInfo(data);
      showNotification(`Found: ${data.filename}`, "success");
    } catch (err) {
      const msg =
        err.response?.data?.error ||
        "Failed to fetch file. Check your passcode.";
      setError(msg);
      showNotification(msg, "error");
    } finally {
      setLoading(false);
    }
  };

  const triggerDownload = () => {
    if (!fileInfo?.signedUrl) return;
    const a = document.createElement("a");
    a.href = fileInfo.signedUrl;
    a.download = fileInfo.filename || "download";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    showNotification(`Downloading "${fileInfo.filename}"...`, "success");
  };

  const formatSize = (bytes) => {
    if (!bytes) return "";
    if (bytes > 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
    if (bytes > 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const formatDateTime = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
  };

  return (
    <div>
      {/* Passcode card */}
      <div className="bg-white dark:bg-white/3 border border-slate-300 dark:border-white/8 rounded-2xl p-5 sm:p-6 shadow-md dark:shadow-2xl mb-5 transition-colors duration-300">
        <p className="text-slate-700 dark:text-slate-400 text-sm text-center mb-4">
          Enter 6-digit passcode
        </p>

        <div
          className="flex gap-2 sm:gap-3 justify-center mb-5"
          onPaste={handlePaste}
        >
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
                    ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 dark:border-indigo-500/60 text-indigo-600 dark:text-indigo-300"
                    : "border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 focus:border-indigo-400 dark:focus:border-indigo-500/50 focus:bg-indigo-50 dark:focus:bg-indigo-500/5"
                }
              `}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-sm text-center">
            ⚠ {error}
          </div>
        )}

        <button
          onClick={handleFetch}
          disabled={loading || passcode.some((d) => !d)}
          className="w-full py-3.5 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-55 disabled:cursor-not-allowed text-white font-semibold rounded-xl border border-purple-300/60 dark:border-transparent shadow-sm dark:shadow-lg dark:shadow-purple-500/25 transition-all duration-200 flex items-center justify-center gap-2"
        >
          {loading ? (
            <span className="flex items-center gap-2">
              <svg
                className="animate-spin w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8v8z"
                />
              </svg>
              Fetching file…
            </span>
          ) : (
            <>
              <LockOpenIcon className="w-5 h-5" /> Unlock File
            </>
          )}
        </button>
      </div>

      {/* File found section */}
      {fileInfo && (
        <div className="space-y-4 fade-in">
          <div className="bg-white dark:bg-white/3 border border-slate-300 dark:border-white/10 rounded-2xl p-5 shadow-sm transition-colors duration-300">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 sm:w-14 sm:h-14 rounded-xl bg-linear-to-br from-indigo-100 dark:from-indigo-500/20 to-purple-100 dark:to-purple-500/20 border border-indigo-200 dark:border-indigo-500/20 flex items-center justify-center shrink-0">
                <CloudArrowDownIcon className="w-6 h-6 sm:w-7 sm:h-7 text-indigo-500 dark:text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-slate-900 dark:text-white font-semibold truncate">
                  {fileInfo.filename}
                </p>
                <p className="text-slate-600 dark:text-slate-400 text-sm">
                  {formatSize(fileInfo.size)}
                </p>
                <p className="text-rose-500 dark:text-rose-400 text-xs mt-0.5 font-medium">
                  🕒 Expires at {formatDateTime(fileInfo.expiresAt)}
                </p>
                <p className="text-slate-500 dark:text-slate-400 text-xs mt-0.5">
                  Downloads remaining: {fileInfo.downloadsRemaining ?? 1}
                </p>
              </div>
            </div>
          </div>

          <button
            onClick={triggerDownload}
            className="w-full py-4 bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-2xl border border-indigo-300/60 dark:border-transparent shadow-sm dark:shadow-lg dark:shadow-indigo-500/30 transition-all duration-200 flex items-center justify-center gap-3 text-base"
          >
            <ArrowDownTrayIcon className="w-5 h-5" />
            Download File
          </button>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  MAIN PAGE
// ─────────────────────────────────────────────
export default function FilePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("send");

  return (
    <div className="min-h-screen light-mesh bg-linear-to-b from-slate-50 to-indigo-50/40 dark:bg-slate-950 transition-colors duration-300">
      <div className="max-w-2xl mx-auto px-4 py-10 sm:py-12 pb-24 sm:pb-12">
        {/* Heading */}
        <div className="text-center mb-8 fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-100 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/20 rounded-full text-indigo-600 dark:text-indigo-400 text-sm font-medium mb-4">
            <CloudArrowUpIcon className="w-4 h-4" />
            File Transfer
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-3">
            Share anything,{" "}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-indigo-500 to-purple-500">
              securely
            </span>
          </h1>
          <p className="text-slate-700 dark:text-slate-400 text-sm sm:text-base">
            {user ? (
              <>
                Upload files up to{" "}
                <span className="font-medium text-indigo-500">8 GB</span>. Files
                are{" "}
                <span className="font-medium text-rose-500 dark:text-rose-400">
                  permanently deleted
                </span>{" "}
                after the first download.
              </>
            ) : (
              <>
                Upload files up to{" "}
                <span className="font-medium text-amber-500">500 MB</span> as a
                guest.{" "}
                <span className="font-medium text-rose-500 dark:text-rose-400">
                  Auto-deleted
                </span>{" "}
                after download.
              </>
            )}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 bg-white dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl mb-6 shadow-sm fade-in">
          {[
            { id: "send", label: "Send", icon: CloudArrowUpIcon },
            { id: "receive", label: "Receive", icon: CloudArrowDownIcon },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === id
                  ? "bg-linear-to-r from-indigo-600 to-purple-600 text-white shadow-md shadow-indigo-500/25"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === "send" && <SendTab user={user} />}
        {activeTab === "receive" && <ReceiveTab />}
      </div>
    </div>
  );
}
