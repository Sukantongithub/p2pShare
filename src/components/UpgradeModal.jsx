import { XMarkIcon, SparklesIcon, ChartBarIcon, CloudArrowUpIcon } from '@heroicons/react/24/outline';

const PACKS = [
  { gb: 1, price: 12, label: 'Starter', highlight: false },
  { gb: 5, price: 55, label: 'Popular', highlight: true, saving: 'Save ₹5' },
  { gb: 10, price: 99, label: 'Value', highlight: false, saving: 'Save ₹21' },
];

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
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-md bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-white/10 overflow-hidden fade-in">

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 px-6 py-5 relative">
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
              <h2 className="text-white font-bold text-lg">Free Limit Reached</h2>
              <p className="text-white/70 text-sm">You've used your 8 GB monthly allowance</p>
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
              className="h-full bg-gradient-to-r from-rose-500 to-orange-500 rounded-full"
              style={{ width: `${pct}%` }}
            />
          </div>
          <p className="text-xs text-slate-400 dark:text-slate-500 mt-1.5">Resets on the 1st of every month</p>
        </div>

        {/* Packs */}
        <div className="px-6 py-5">
          <p className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-1.5">
            <CloudArrowUpIcon className="w-4 h-4 text-indigo-500" />
            Buy extra storage — pay only for what you need
          </p>
          <div className="grid grid-cols-3 gap-2 mb-4">
            {PACKS.map((pack) => (
              <div
                key={pack.gb}
                className={`relative rounded-xl border p-3 text-center transition-all duration-200 ${
                  pack.highlight
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/10'
                    : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/3'
                }`}
              >
                {pack.highlight && (
                  <span className="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2 py-0.5 bg-indigo-600 text-white text-[9px] font-bold rounded-full uppercase tracking-wider whitespace-nowrap">
                    Best value
                  </span>
                )}
                <p className={`text-xl font-bold ${pack.highlight ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-900 dark:text-white'}`}>
                  {pack.gb} GB
                </p>
                <p className={`text-lg font-semibold ${pack.highlight ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-800 dark:text-slate-200'}`}>
                  ₹{pack.price}
                </p>
                <p className="text-[10px] text-slate-400 dark:text-slate-500">{pack.label}</p>
                {pack.saving && (
                  <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-medium mt-0.5">{pack.saving}</p>
                )}
              </div>
            ))}
          </div>

          {/* Coming soon CTA */}
          <div className="bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 text-center">
            <p className="text-slate-500 dark:text-slate-400 text-sm">
              🚀 <span className="font-medium text-slate-700 dark:text-slate-300">Payments launching soon!</span>
              <br />
              <span className="text-xs">We'll notify you when top-ups are available.</span>
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
