import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useBusyShare } from "../hooks/useBusyShare";
import {
  BoltIcon,
  CloudArrowUpIcon,
  CloudArrowDownIcon,
  LockOpenIcon,
  XCircleIcon,
  CheckCircleIcon,
  ArrowDownTrayIcon,
  UserCircleIcon,
  ArrowRightIcon,
  SignalIcon,
} from "@heroicons/react/24/outline";

function fmtBytes(b) {
  if (!b) return "0 B";
  if (b >= 1024 ** 3) return `${(b / 1024 ** 3).toFixed(2)} GB`;
  if (b >= 1024 ** 2) return `${(b / 1024 ** 2).toFixed(1)} MB`;
  return `${(b / 1024).toFixed(0)} KB`;
}

function fmtSpeed(bps) {
  if (!bps) return "—";
  if (bps >= 1024 ** 2) return `${(bps / 1024 ** 2).toFixed(1)} MB/s`;
  return `${(bps / 1024).toFixed(0)} KB/s`;
}

function fmtEta(sec) {
  if (!sec || sec <= 0) return "—";
  if (sec < 60) return `${sec}s`;
  return `${Math.floor(sec / 60)}m ${sec % 60}s`;
}

// ─────────────────────────────────────────────
//  SEND TAB
// ─────────────────────────────────────────────
function SendTab() {
  const { state, code, progress, speed, eta, error, fileMeta, maxBytes, isGuest, startTransfer, cancel, reset } = useBusyShare();
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [sizeErr, setSizeErr] = useState("");
  const fileInput = useRef(null);

  const handleFile = (f) => {
    if (!f) return;
    if (f.size > maxBytes) {
      setSizeErr(`File too large. Max is ${isGuest ? "500 MB" : "5 GB"}.`);
      return;
    }
    setSizeErr("");
    setSelectedFile(f);
  };

  const handleDrop = (e) => {
    e.preventDefault(); setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };

  const doStart = () => {
    if (!selectedFile) return;
    startTransfer(selectedFile);
    setSelectedFile(null);
  };

  const doReset = () => { reset(); setSizeErr(""); setSelectedFile(null); };

  // done
  if (state === "done") {
    return (
      <div className="fade-in text-center py-6">
        <CheckCircleIcon className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
        <p className="text-emerald-600 dark:text-emerald-400 font-bold text-lg mb-1">Transfer Complete!</p>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-5">
          {fileMeta?.name} · {fmtBytes(fileMeta?.size)} sent
        </p>
        <button onClick={doReset} className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all text-sm">
          Send Another File
        </button>
      </div>
    );
  }

  // cancelled / error
  if (state === "cancelled" || state === "error") {
    return (
      <div className="fade-in text-center py-6">
        <XCircleIcon className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <p className="text-rose-600 dark:text-rose-400 font-semibold mb-1">
          {state === "cancelled" ? "Transfer Cancelled" : "Transfer Failed"}
        </p>
        {error && <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">{error}</p>}
        <button onClick={doReset} className="px-5 py-2.5 bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/15 text-slate-800 dark:text-white font-semibold rounded-xl transition-all text-sm">
          Try Again
        </button>
      </div>
    );
  }

  // waiting for receiver
  if (state === "waiting") {
    return (
      <div className="fade-in">
        <div className="bg-white dark:bg-white/3 border border-slate-300 dark:border-white/8 rounded-2xl p-6 shadow-md text-center">
          <p className="text-slate-500 dark:text-slate-400 text-sm mb-1">Share this code with the receiver</p>
          <div className="flex items-center justify-center gap-2 my-4 flex-wrap">
            {code.split("").map((d, i) => (
              <div key={i} className="w-12 h-14 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/40 flex items-center justify-center text-2xl font-bold text-indigo-600 dark:text-indigo-300 float-anim" style={{ animationDelay: `${i * 0.08}s` }}>
                {d}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-center gap-2 text-slate-400 text-sm mb-2">
            <SignalIcon className="w-4 h-4 animate-pulse text-indigo-500" />
            Waiting for receiver to connect…
          </div>

          <p className="text-slate-400 dark:text-slate-500 text-xs mb-4">
            {fileMeta?.name} · {fmtBytes(fileMeta?.size)}
          </p>

          <button onClick={cancel} className="px-4 py-2 rounded-lg text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-sm font-medium transition-all">
            <XCircleIcon className="w-4 h-4 inline mr-1 -mt-0.5" /> Cancel
          </button>
        </div>
      </div>
    );
  }

  // connecting / transferring
  if (state === "connecting" || state === "transferring") {
    const pct = state === "connecting" ? null : progress;
    return (
      <div className="fade-in">
        <div className="bg-white dark:bg-white/3 border border-slate-300 dark:border-white/8 rounded-2xl p-6 shadow-md">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 flex items-center justify-center shrink-0">
              <CloudArrowUpIcon className="w-5 h-5 text-indigo-500" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-slate-900 dark:text-white font-semibold truncate">{fileMeta?.name}</p>
              <p className="text-slate-500 dark:text-slate-400 text-xs">{fmtBytes(fileMeta?.size)}</p>
            </div>
          </div>

          {state === "connecting" ? (
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Establishing WebRTC connection…
            </div>
          ) : (
            <>
              {/* Progress bar */}
              <div className="w-full h-3 bg-slate-100 dark:bg-white/8 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full rounded-full transition-all duration-300 bg-linear-to-r from-indigo-500 to-purple-500"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-4">
                <span>{pct?.toFixed(1)}%</span>
                <span>{fmtSpeed(speed)}</span>
                <span>ETA {fmtEta(eta)}</span>
              </div>
            </>
          )}

          <button onClick={cancel} className="mt-2 w-full py-2.5 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-sm font-medium transition-all flex items-center justify-center gap-1.5">
            <XCircleIcon className="w-4 h-4" /> Cancel Transfer
          </button>
        </div>
      </div>
    );
  }

  // idle — file picker
  return (
    <div className="fade-in">
      {/* Guest banner */}
      {isGuest && (
        <div className="mb-5 p-4 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50 dark:bg-amber-500/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-amber-800 dark:text-amber-300 text-sm font-semibold">🚀 Guest Mode</p>
              <p className="text-amber-700 dark:text-amber-400/80 text-xs mt-0.5">500 MB limit per transfer</p>
            </div>
            <Link to="/login" className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white text-xs font-semibold transition-all shrink-0">
              <UserCircleIcon className="w-3.5 h-3.5" /> Sign in for 5 GB <ArrowRightIcon className="w-3 h-3" />
            </Link>
          </div>
        </div>
      )}

      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInput.current?.click()}
        className={`relative cursor-pointer border-2 border-dashed rounded-2xl p-8 text-center transition-all duration-200 ${
          dragging
            ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 scale-[1.01]"
            : "border-slate-300 dark:border-white/15 bg-slate-50 dark:bg-white/3 hover:border-indigo-400 dark:hover:border-indigo-500/50 hover:bg-indigo-50/50 dark:hover:bg-indigo-500/5"
        }`}
      >
        <input ref={fileInput} type="file" className="hidden" onChange={(e) => handleFile(e.target.files[0])} />

        {selectedFile ? (
          <>
            <CloudArrowUpIcon className="w-10 h-10 text-indigo-500 mx-auto mb-2" />
            <p className="font-semibold text-slate-900 dark:text-white truncate">{selectedFile.name}</p>
            <p className="text-slate-500 dark:text-slate-400 text-sm">{fmtBytes(selectedFile.size)}</p>
          </>
        ) : (
          <>
            <BoltIcon className="w-10 h-10 text-indigo-400 mx-auto mb-2" />
            <p className="font-semibold text-slate-800 dark:text-white mb-1">Drop file for instant P2P transfer</p>
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              or click to browse · max {isGuest ? "500 MB" : "5 GB"}
            </p>
          </>
        )}
      </div>

      {sizeErr && (
        <div className="mt-3 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-sm">
          ⚠ {sizeErr}
        </div>
      )}

      {selectedFile && (
        <button
          onClick={doStart}
          className="mt-4 w-full py-3.5 bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl border border-indigo-300/60 dark:border-transparent shadow-sm dark:shadow-lg dark:shadow-indigo-500/25 transition-all duration-200 flex items-center justify-center gap-2"
        >
          <BoltIcon className="w-5 h-5" /> Start Instant Transfer
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
//  RECEIVE TAB
// ─────────────────────────────────────────────
function ReceiveTab() {
  const { state, progress, speed, eta, error, fileMeta, receivedFile, joinTransfer, cancel, reset } = useBusyShare();
  const [passcode, setPasscode] = useState(Array(6).fill(""));
  const inputRefs = useRef([]);

  const handleDigit = (i, v) => {
    if (!/^\d*$/.test(v)) return;
    const u = [...passcode]; u[i] = v.slice(-1); setPasscode(u);
    if (v && i < 5) inputRefs.current[i + 1]?.focus();
  };

  const handleKey = (i, e) => {
    if (e.key === "Backspace" && !passcode[i] && i > 0) inputRefs.current[i - 1]?.focus();
    if (e.key === "Enter") doJoin();
  };

  const handlePaste = (e) => {
    const d = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, 6);
    if (d.length === 6) { setPasscode(d.split("")); inputRefs.current[5]?.focus(); }
    e.preventDefault();
  };

  const doJoin = () => {
    const code = passcode.join("");
    if (code.length !== 6) return;
    joinTransfer(code);
  };

  const doReset = () => { reset(); setPasscode(Array(6).fill("")); };

  const triggerDownload = () => {
    if (!receivedFile) return;
    const a = document.createElement("a");
    a.href = receivedFile.url; a.download = receivedFile.name;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
  };

  // done
  if (state === "done" && receivedFile) {
    return (
      <div className="fade-in text-center py-4">
        <CheckCircleIcon className="w-14 h-14 text-emerald-500 mx-auto mb-3" />
        <p className="text-emerald-600 dark:text-emerald-400 font-bold text-lg mb-1">Transfer Complete!</p>
        <p className="text-slate-500 dark:text-slate-400 text-sm mb-5">
          {receivedFile.name} · {fmtBytes(receivedFile.size)}
        </p>
        <button
          onClick={triggerDownload}
          className="flex items-center gap-2 mx-auto mb-4 px-6 py-3 bg-linear-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/20 transition-all"
        >
          <ArrowDownTrayIcon className="w-5 h-5" /> Download File
        </button>
        <button onClick={doReset} className="text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 text-sm transition-colors">
          Receive Another
        </button>
      </div>
    );
  }

  // cancelled / error
  if (state === "cancelled" || state === "error") {
    return (
      <div className="fade-in text-center py-6">
        <XCircleIcon className="w-12 h-12 text-rose-500 mx-auto mb-3" />
        <p className="text-rose-600 dark:text-rose-400 font-semibold mb-1">
          {state === "cancelled" ? "Transfer Cancelled" : "Transfer Failed"}
        </p>
        {error && <p className="text-slate-500 dark:text-slate-400 text-sm mb-4">{error}</p>}
        <button onClick={doReset} className="px-5 py-2.5 bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/15 text-slate-800 dark:text-white font-semibold rounded-xl text-sm transition-all">
          Try Again
        </button>
      </div>
    );
  }

  // connecting / transferring
  if (state === "connecting" || state === "transferring") {
    return (
      <div className="fade-in">
        <div className="bg-white dark:bg-white/3 border border-slate-300 dark:border-white/8 rounded-2xl p-6 shadow-md">
          {fileMeta && (
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-purple-50 dark:bg-purple-500/10 flex items-center justify-center shrink-0">
                <CloudArrowDownIcon className="w-5 h-5 text-purple-500" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-slate-900 dark:text-white font-semibold truncate">{fileMeta.name}</p>
                <p className="text-slate-500 dark:text-slate-400 text-xs">{fmtBytes(fileMeta.size)}</p>
              </div>
            </div>
          )}

          {state === "connecting" ? (
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm mb-4">
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              Establishing WebRTC connection…
            </div>
          ) : (
            <>
              <div className="w-full h-3 bg-slate-100 dark:bg-white/8 rounded-full overflow-hidden mb-3">
                <div
                  className="h-full rounded-full bg-linear-to-r from-purple-500 to-pink-500 transition-all duration-300"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-4">
                <span>{progress.toFixed(1)}%</span>
                <span>{fmtSpeed(speed)}</span>
                <span>ETA {fmtEta(eta)}</span>
              </div>
            </>
          )}

          <button onClick={cancel} className="w-full py-2.5 rounded-xl text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 text-sm font-medium transition-all flex items-center justify-center gap-1.5">
            <XCircleIcon className="w-4 h-4" /> Cancel
          </button>
        </div>
      </div>
    );
  }

  // idle — passcode entry
  return (
    <div className="fade-in">
      <div className="bg-white dark:bg-white/3 border border-slate-300 dark:border-white/8 rounded-2xl p-5 sm:p-6 shadow-md">
        <p className="text-slate-700 dark:text-slate-400 text-sm text-center mb-4">
          Enter the 6-digit transfer code
        </p>

        <div className="flex gap-2 sm:gap-3 justify-center mb-5" onPaste={handlePaste}>
          {passcode.map((d, i) => (
            <input
              key={i}
              ref={(el) => (inputRefs.current[i] = el)}
              type="text" inputMode="numeric" maxLength={1} value={d}
              onChange={(e) => handleDigit(i, e.target.value)}
              onKeyDown={(e) => handleKey(i, e)}
              className={`w-10 h-12 sm:w-14 sm:h-16 text-center text-lg sm:text-2xl font-bold rounded-xl border transition-all duration-200 text-slate-900 dark:text-white outline-none
                ${d
                  ? "border-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 dark:border-indigo-500/60 text-indigo-600 dark:text-indigo-300"
                  : "border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/5 focus:border-indigo-400 dark:focus:border-indigo-500/50"
                }`}
            />
          ))}
        </div>

        {error && (
          <div className="mb-4 p-3 bg-rose-50 dark:bg-rose-500/10 border border-rose-200 dark:border-rose-500/20 rounded-xl text-rose-600 dark:text-rose-400 text-sm text-center">
            ⚠ {error}
          </div>
        )}

        <button
          onClick={doJoin}
          disabled={passcode.some((d) => !d)}
          className="w-full py-3.5 bg-linear-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-55 disabled:cursor-not-allowed text-white font-semibold rounded-xl border border-purple-300/60 dark:border-transparent shadow-sm dark:shadow-lg dark:shadow-purple-500/25 transition-all flex items-center justify-center gap-2"
        >
          <LockOpenIcon className="w-5 h-5" /> Connect & Receive
        </button>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
//  MAIN PAGE
// ─────────────────────────────────────────────
export default function BusySharePage() {
  const [activeTab, setActiveTab] = useState("send");

  return (
    <div className="min-h-screen light-mesh bg-linear-to-b from-slate-50 to-violet-50/40 dark:bg-slate-950 transition-colors duration-300">
      <div className="max-w-2xl mx-auto px-4 py-10 sm:py-12 pb-24 sm:pb-12">

        {/* Heading */}
        <div className="text-center mb-8 fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-violet-100 dark:bg-violet-500/10 border border-violet-200 dark:border-violet-500/20 rounded-full text-violet-600 dark:text-violet-400 text-sm font-medium mb-4">
            <BoltIcon className="w-4 h-4" />
            Instant P2P Transfer
          </div>
          <h1 className="text-4xl font-bold text-slate-900 dark:text-white mb-3">
            Busy{" "}
            <span className="text-transparent bg-clip-text bg-linear-to-r from-violet-500 to-pink-500">
              Share
            </span>
          </h1>
          <p className="text-slate-700 dark:text-slate-400 text-sm sm:text-base max-w-md mx-auto">
            Browser-to-browser transfer. Files go{" "}
            <span className="font-medium text-violet-500">directly between devices</span> — never stored on our servers.
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex gap-1 p-1 bg-white dark:bg-white/5 border border-slate-300 dark:border-white/10 rounded-xl mb-6 shadow-sm fade-in">
          {[
            { id: "send",    label: "Send File",    icon: CloudArrowUpIcon },
            { id: "receive", label: "Receive File",  icon: CloudArrowDownIcon },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 ${
                activeTab === id
                  ? "bg-linear-to-r from-violet-600 to-pink-600 text-white shadow-md shadow-violet-500/25"
                  : "text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10"
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        {activeTab === "send"    && <SendTab />}
        {activeTab === "receive" && <ReceiveTab />}
      </div>
    </div>
  );
}
