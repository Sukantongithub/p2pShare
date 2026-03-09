import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { useTheme } from "../../context/ThemeContext";
import {
  EnvelopeIcon,
  LockClosedIcon,
  EyeIcon,
  EyeSlashIcon,
  ShareIcon,
  ShieldCheckIcon,
  BoltIcon,
} from "@heroicons/react/24/outline";

const FEATURES = [
  { icon: BoltIcon,        text: "Lightning-fast transfers up to 8 GB" },
  { icon: ShieldCheckIcon, text: "End-to-end secured with a 6-digit passcode" },
  { icon: LockClosedIcon,  text: "Files auto-delete after every download" },
];

export default function LoginPage() {
  const [mode, setMode]         = useState("signin");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");
  const [success, setSuccess]   = useState("");
  const navigate = useNavigate();
  const { dark } = useTheme();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(""); setSuccess(""); setLoading(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        setSuccess("Account created! Check your email to confirm, then sign in.");
        setMode("signin");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate("/");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  /* ── Theme-aware colours (guaranteed, no Tailwind dark: override risk) ── */
  const bg          = dark ? "#0f172a" : "#f5f3ff";
  const cardBg      = dark ? "rgba(255,255,255,0.04)" : "#ffffff";
  const cardBorder  = dark ? "rgba(255,255,255,0.08)" : "#e5e7eb";
  const headingClr  = dark ? "#f1f5f9"  : "#111827";
  const subtitleClr = dark ? "#94a3b8"  : "#6b7280";
  const labelClr    = dark ? "#94a3b8"  : "#374151";
  const inputBg     = dark ? "rgba(255,255,255,0.06)" : "#ffffff";
  const inputBorder = dark ? "rgba(255,255,255,0.12)" : "#d4d0fb";
  const inputClr    = dark ? "#f1f5f9"  : "#111827";
  const phClr       = dark ? "#64748b"  : "#9ca3af";
  const toggleBg    = dark ? "rgba(255,255,255,0.08)" : "#ede9fe";
  const inactiveClr = dark ? "#94a3b8"  : "#5b21b6";
  const dividerClr  = dark ? "rgba(255,255,255,0.1)" : "#e5e7eb";
  const orClr       = dark ? "#475569"  : "#9ca3af";
  const ctaBg       = dark ? "rgba(255,255,255,0.06)" : "#f5f3ff";
  const ctaBorder   = dark ? "rgba(255,255,255,0.1)"  : "#ddd6fe";
  const ctaClr      = dark ? "#a78bfa"  : "#5b21b6";
  const termsClr    = dark ? "#475569"  : "#9ca3af";
  const accentClr   =        "#6d28d9";

  const inputStyle = {
    background: inputBg,
    border: `2px solid ${inputBorder}`,
    color: inputClr,
    outline: "none",
  };

  const handleFocus = (e) => {
    e.target.style.border = "2px solid #4f46e5";
    e.target.style.boxShadow = "0 0 0 3px rgba(79,70,229,0.15)";
  };
  const handleBlur = (e) => {
    e.target.style.border = `2px solid ${inputBorder}`;
    e.target.style.boxShadow = "none";
  };

  return (
    <div style={{ minHeight: "100vh", display: "flex", background: bg }}>

      {/* ── LEFT — brand panel (desktop only, light only) ──────────── */}
      {!dark && (
        <div
          className="hidden lg:flex lg:w-[55%] relative overflow-hidden flex-col items-center justify-center p-16"
          style={{ background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 50%, #9333ea 100%)" }}
        >
          {/* Animated glow orbs */}
          <div className="absolute inset-0 pointer-events-none overflow-hidden">
            <div
              className="absolute -top-32 -left-32 w-[500px] h-[500px] rounded-full opacity-40 animate-[pulse_6s_ease-in-out_infinite]"
              style={{ background: "radial-gradient(circle, rgba(255,255,255,0.25) 0%, transparent 70%)" }}
            />
            <div
              className="absolute bottom-0 right-0 w-[400px] h-[400px] rounded-full opacity-30 animate-[pulse_8s_ease-in-out_infinite_1.5s]"
              style={{ background: "radial-gradient(circle, rgba(216,180,254,0.4) 0%, transparent 70%)" }}
            />
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] rounded-full opacity-20 animate-[pulse_7s_ease-in-out_infinite_3s]"
              style={{ background: "radial-gradient(circle, rgba(255,255,255,0.3) 0%, transparent 70%)" }}
            />
          </div>

          {/* Dot-grid texture */}
          <div
            className="absolute inset-0 opacity-[0.08]"
            style={{
              backgroundImage: "radial-gradient(circle, white 1.5px, transparent 1.5px)",
              backgroundSize: "30px 30px",
            }}
          />

          <div className="relative z-10 text-white max-w-md">
            {/* Logo wordmark */}
            <div className="flex items-center gap-3 mb-14">
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center"
                style={{ background: "rgba(255,255,255,0.2)", border: "1px solid rgba(255,255,255,0.3)" }}
              >
                <ShareIcon className="w-6 h-6 text-white" />
              </div>
              <span className="text-2xl font-extrabold tracking-tight">P2PShare</span>
            </div>

            {/* Headline */}
            <h2 className="text-5xl font-extrabold leading-[1.15] mb-5 tracking-tight">
              Share files.<br />
              <span style={{ color: "rgba(221,214,254,1)" }}>Instantly.</span><br />
              <span style={{ color: "rgba(233,213,255,0.9)" }}>Securely.</span>
            </h2>
            <p style={{ color: "rgba(255,255,255,0.72)" }} className="text-base mb-12 leading-relaxed max-w-sm">
              Send any file up to <strong className="text-white">8 GB</strong> to anyone with a simple 6-digit passcode.
              No account required on the receiver's end.
            </p>

            {/* Feature list */}
            <ul className="space-y-4 mb-14">
              {FEATURES.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-4">
                  <span
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.25)" }}
                  >
                    <Icon className="w-4 h-4 text-white" />
                  </span>
                  <span style={{ color: "rgba(255,255,255,0.85)" }} className="text-sm font-medium">{text}</span>
                </li>
              ))}
            </ul>

            {/* Status pill */}
            <div
              className="inline-flex items-center gap-2.5 px-5 py-3 rounded-2xl text-sm font-medium"
              style={{ background: "rgba(255,255,255,0.12)", border: "1px solid rgba(255,255,255,0.2)" }}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span style={{ color: "rgba(255,255,255,0.85)" }}>Free tier · 8 GB/month · No credit card</span>
            </div>
          </div>
        </div>
      )}

      {/* ── RIGHT — form panel ──────────────────────────────────────── */}
      <div
        className="flex-1 flex items-center justify-center p-6 sm:p-12"
        style={{ background: dark ? "transparent" : "#f8f7ff" }}
      >
        <div className="w-full max-w-[380px] fade-in">

          {/* Mobile logo (hidden on desktop when left panel is visible) */}
          <div className={`${!dark ? "flex lg:hidden" : "flex"} items-center justify-center gap-2.5 mb-10`}>
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center shadow-lg"
              style={{ background: "linear-gradient(135deg, #4f46e5, #9333ea)", boxShadow: "0 4px 14px rgba(79,70,229,0.4)" }}
            >
              <ShareIcon className="w-5 h-5 text-white" />
            </div>
            <span className="text-xl font-extrabold tracking-tight" style={{ color: headingClr }}>
              P2P<span style={{ color: "#4f46e5" }}>Share</span>
            </span>
          </div>

          {/* Greeting */}
          <div className="mb-8">
            <h1 className="text-[2rem] font-extrabold tracking-tight leading-tight" style={{ color: headingClr }}>
              {mode === "signin" ? "Welcome back 👋" : "Create account"}
            </h1>
            <p className="mt-2 text-sm leading-relaxed" style={{ color: subtitleClr }}>
              {mode === "signin"
                ? "Sign in to your account to start sharing."
                : "Set up your free account — takes 10 seconds."}
            </p>
          </div>

          {/* Mode toggle */}
          <div className="flex p-1 mb-7 rounded-xl gap-1" style={{ background: toggleBg }}>
            {["signin", "signup"].map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(""); setSuccess(""); }}
                style={
                  mode === m
                    ? { background: "#4f46e5", color: "#fff", boxShadow: "0 2px 8px rgba(79,70,229,0.4)" }
                    : { color: inactiveClr }
                }
                className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-all duration-200 hover:opacity-80"
              >
                {m === "signin" ? "Sign In" : "Sign Up"}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">

            {/* Email */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ color: labelClr }}>
                Email address
              </label>
              <div className="relative">
                <EnvelopeIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: "#7c3aed" }} />
                <input
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  required
                  className="w-full pl-11 pr-4 py-3 rounded-xl text-sm transition-all duration-200"
                  style={{ ...inputStyle, "::placeholder": { color: phClr } }}
                />
              </div>
            </div>

            {/* Password */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest mb-2" style={{ color: labelClr }}>
                Password
              </label>
              <div className="relative">
                <LockClosedIcon className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: "#7c3aed" }} />
                <input
                  type={showPw ? "text" : "password"}
                  placeholder="Min. 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={handleFocus}
                  onBlur={handleBlur}
                  required
                  minLength={6}
                  className="w-full pl-11 pr-12 py-3 rounded-xl text-sm transition-all duration-200"
                  style={inputStyle}
                />
                <button
                  type="button"
                  onClick={() => setShowPw((v) => !v)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 transition-colors"
                  style={{ color: orClr }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = "#4f46e5"; }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = orClr; }}
                >
                  {showPw ? <EyeSlashIcon className="w-5 h-5" /> : <EyeIcon className="w-5 h-5" />}
                </button>
              </div>
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl text-sm font-medium"
                style={{ background: "#fff1f2", border: "1.5px solid #fca5a5", color: "#b91c1c" }}>
                <span className="shrink-0">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Success */}
            {success && (
              <div className="flex items-start gap-2.5 p-3.5 rounded-xl text-sm font-medium"
                style={{ background: "#f0fdf4", border: "1.5px solid #86efac", color: "#166534" }}>
                <span className="shrink-0">✓</span>
                <span>{success}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 font-bold text-sm text-white rounded-xl active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200"
              style={{
                background: "linear-gradient(135deg, #4f46e5 0%, #9333ea 100%)",
                boxShadow: "0 4px 20px rgba(79,70,229,0.4)",
              }}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                  {mode === "signup" ? "Creating account…" : "Signing in…"}
                </span>
              ) : mode === "signup" ? "Create Account →" : "Sign In →"}
            </button>
          </form>

          {/* Divider */}
          <div className="flex items-center gap-3 my-6">
            <div className="flex-1 h-px" style={{ background: dividerClr }} />
            <span className="text-xs font-medium" style={{ color: orClr }}>or</span>
            <div className="flex-1 h-px" style={{ background: dividerClr }} />
          </div>

          {/* Guest CTA */}
          <a
            href="/"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200"
            style={{ background: ctaBg, border: `2px solid ${ctaBorder}`, color: ctaClr }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = "0.8"; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = "1"; }}
          >
            🚀 Continue as Guest — no account needed
          </a>


          <p className="text-center text-xs mt-6" style={{ color: termsClr }}>
            By continuing you agree to our{" "}
            <span className="cursor-pointer hover:underline" style={{ color: accentClr }}>Terms</span>{" "}
            &amp;{" "}
            <span className="cursor-pointer hover:underline" style={{ color: accentClr }}>Privacy Policy</span>.
          </p>
        </div>
      </div>
    </div>
  );
}
