import { useRef, useState } from "react";
import axios from "axios";
import DownloadCart from "./DownloadCart";
import { showNotification } from "./Notification";
import {
  LockOpenIcon,
  CloudArrowDownIcon,
  ArrowDownTrayIcon,
} from "@heroicons/react/24/outline";

const API_BASE = import.meta.env.DEV ? "" : import.meta.env.VITE_API_URL || "";

export default function ReceiverPage() {
  const [passcode, setPasscode] = useState(Array(6).fill(""));
  const [loading, setLoading] = useState(false);
  const [fileInfo, setFileInfo] = useState(null);
  const [error, setError] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const inputRefs = useRef([]);

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
    if (bytes > 1024 * 1024 * 1024)
      return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const formatDateTime = (value) => {
    if (!value) return "—";
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString();
  };

  return (
    <div className="min-h-screen light-mesh bg-linear-to-b from-slate-50 to-purple-50/40 dark:bg-slate-950 transition-colors duration-300">
      <div className="max-w-2xl mx-auto px-4 py-10 sm:py-12 pb-24 sm:pb-12">
        {/* Heading */}
        <div className="text-center mb-8 sm:mb-10 fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 dark:bg-purple-500/10 border border-purple-200 dark:border-purple-500/20 rounded-full text-purple-600 dark:text-purple-400 text-sm font-medium mb-4">
            <LockOpenIcon className="w-4 h-4" />
            Receive a File
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-3">
            Enter your{" "}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-purple-500 to-pink-500">
              passcode
            </span>
          </h1>
          <p className="text-slate-700 dark:text-slate-400 text-sm sm:text-base">
            Enter the{" "}
            <span className="text-purple-500 font-medium">
              6-digit passcode
            </span>{" "}
            to access your file.
          </p>
        </div>

        {/* Passcode card */}
        <div className="bg-white dark:bg-white/3 border border-slate-300 dark:border-white/8 rounded-2xl p-5 sm:p-6 fade-in shadow-md dark:shadow-2xl mb-5 transition-colors duration-300">
          <p className="text-slate-700 dark:text-slate-400 text-sm text-center mb-4">
            Enter 6-digit passcode
          </p>

          {/* 6 digit inputs */}
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
                Fetching file...
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
            {/* File info */}
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

            {/* Download button — works on ALL devices including mobile */}
            <button
              onClick={triggerDownload}
              className="w-full py-4 bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-2xl border border-indigo-300/60 dark:border-transparent shadow-sm dark:shadow-lg dark:shadow-indigo-500/30 transition-all duration-200 flex items-center justify-center gap-3 text-base"
            >
              <ArrowDownTrayIcon className="w-5 h-5" />
              Download File
            </button>

            {/* Drag-to-cart — desktop only (drag API not supported on mobile) */}
            <div className="hidden sm:block">
              <p className="text-center text-slate-600 dark:text-slate-600 text-xs mb-3">
                Or drag the card below into the drop zone
              </p>
              <div
                draggable
                onDragStart={() => setIsDragging(true)}
                onDragEnd={() => setIsDragging(false)}
                className={`
                  bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/10 rounded-2xl p-4 cursor-grab active:cursor-grabbing
                  transition-all duration-300 float-anim
                  ${isDragging ? "opacity-60 scale-95 rotate-1" : "hover:border-slate-300 dark:hover:border-white/20"}
                `}
              >
                <div className="flex items-center gap-3">
                  <CloudArrowDownIcon className="w-5 h-5 text-indigo-500 shrink-0" />
                  <span className="text-slate-700 dark:text-slate-300 text-sm font-medium truncate">
                    {fileInfo.filename}
                  </span>
                  <CloudArrowDownIcon className="w-5 h-5 shrink-0 ml-auto text-slate-400" />
                </div>
              </div>
              <div className="mt-3">
                <DownloadCart fileInfo={fileInfo} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
