import {
  XMarkIcon,
  SparklesIcon,
  ChartBarIcon,
  CloudArrowUpIcon,
} from "@heroicons/react/24/outline";

const BASE_PER_GB_MONTH = 10.99;
const ANNUAL_DISCOUNT = 0.15; // 15% off yearly billing

const PLAN_GB = [1, 3, 5, 10];

const PLANS = PLAN_GB.map((gb) => {
  const monthly = gb * BASE_PER_GB_MONTH;
  const annual = monthly * 12 * (1 - ANNUAL_DISCOUNT);
  const annualSaving = monthly * 12 - annual;
  const expiryHours = Math.min(gb * 12, 72); // scales by tier, capped at 72h
  const downloadLimit = gb * 5;

  return {
    gb,
    monthly,
    annual,
    annualSaving,
    expiryHours,
    downloadLimit,
    label:
      gb === 1 ? "Starter" : gb === 5 ? "Popular" : gb === 10 ? "Pro" : "Plus",
    highlight: gb === 5,
  };
});

function fmtINR(value) {
  return `₹${value.toFixed(2)}`;
}

function fmtBytes(bytes) {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

export default function UpgradeModal({ onClose, usage }) {
  const used = usage?.bytesUsed ?? 0;
  const limit = usage?.freeLimit ?? 8 * 1024 ** 3;
  const pct = Math.min((used / limit) * 100, 100);

  return (
    <div className="fixed inset-0 z-200 flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden fade-in">
        {/* Header */}
        <div className="bg-linear-to-r from-indigo-600 to-purple-600 px-6 py-5 relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
          >
            <XMarkIcon className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <SparklesIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-white font-bold text-lg">
                Free Limit Reached
              </h2>
              <p className="text-white/70 text-sm">
                You've used your 8 GB monthly allowance
              </p>
            </div>
          </div>
        </div>

        {/* Usage bar */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-white/8">
          <div className="flex justify-between text-sm mb-2">
            <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-400">
              <ChartBarIcon className="w-4 h-4" />
              This month's usage
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {fmtBytes(used)} / {fmtBytes(limit)}
            </span>
          </div>
          <div className="w-full h-2.5 bg-slate-100 dark:bg-white/8 rounded-full overflow-hidden">
            <div
              className="h-full bg-linear-to-r from-rose-500 to-orange-500 rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">
            Resets on the 1st of every month
          </p>
        </div>

        {/* Subscription plans */}
        <div className="px-6 py-5">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-1.5">
            <CloudArrowUpIcon className="w-4 h-4 text-indigo-500" />
            Choose a subscription plan
          </p>

          <div className="space-y-2.5 mb-4">
            {PLANS.map((plan) => (
              <div
                key={plan.gb}
                className={`relative rounded-xl border p-3.5 transition-all duration-200 ${
                  plan.highlight
                    ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10"
                    : "border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/3"
                }`}
              >
                {plan.highlight && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-indigo-600 text-white text-[9px] font-bold rounded-full uppercase tracking-wider whitespace-nowrap">
                    Best value
                  </span>
                )}

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p
                      className={`text-base font-bold ${plan.highlight ? "text-indigo-600 dark:text-indigo-400" : "text-slate-900 dark:text-white"}`}
                    >
                      +{plan.gb} GB{" "}
                      <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                        ({plan.label})
                      </span>
                    </p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      Extra monthly storage
                    </p>
                  </div>

                  <div className="text-right">
                    <p
                      className={`text-sm font-semibold ${plan.highlight ? "text-indigo-600 dark:text-indigo-400" : "text-slate-800 dark:text-slate-200"}`}
                    >
                      {fmtINR(plan.monthly)} /month
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      {fmtINR(plan.annual)} /year
                    </p>
                  </div>
                </div>

                <p className="text-[11px] mt-1.5 text-emerald-600 dark:text-emerald-400 font-medium">
                  Save {fmtINR(plan.annualSaving)} annually
                </p>

                <ul className="mt-2.5 space-y-1 text-[11px] text-slate-600 dark:text-slate-400">
                  <li>• File expiry: {plan.expiryHours} hours</li>
                  <li>• Download limit: {plan.downloadLimit} downloads</li>
                  <li>• File Access Tracking & Analytics</li>
                  <li className="pl-2">- Who downloaded the file</li>
                  <li className="pl-2">- Date & time of access</li>
                  <li className="pl-2">- Download count</li>
                </ul>
              </div>
            ))}
          </div>

          {/* Coming soon CTA */}
          <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 text-center">
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              🚀{" "}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Subscriptions launching soon!
              </span>
              <br />
              <span className="text-xs">
                Monthly and annual billing will be available.
              </span>
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 pb-5">
          <button
            onClick={onClose}
            className="w-full py-2.5 rounded-xl text-sm font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
