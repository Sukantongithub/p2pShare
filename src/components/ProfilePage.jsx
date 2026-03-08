import { useMemo, useState } from 'react';
import {
  UserCircleIcon,
  EnvelopeIcon,
  IdentificationIcon,
  CalendarDaysIcon,
  ChartBarIcon,
  SparklesIcon,
  ClipboardDocumentIcon,
  ClipboardDocumentCheckIcon,
} from '@heroicons/react/24/outline';
import { useAuth } from '../hooks/useAuth';
import { useUsage } from '../hooks/useUsage';
import { showNotification } from './Notification';

function fmtBytes(bytes) {
  if (!bytes) return '0 B';
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
  return `${(bytes / 1024).toFixed(0)} KB`;
}

const BASE_PER_GB_MONTH = 10.99;
const ANNUAL_DISCOUNT = 0.15;
const PLAN_GB = [1, 3, 5, 10];

function fmtINR(value) {
  return `₹${value.toFixed(2)}`;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const { usage } = useUsage();
  const [copied, setCopied] = useState(false);

  const createdAt = useMemo(() => {
    if (!user?.created_at) return '—';
    return new Date(user.created_at).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }, [user?.created_at]);

  const bytesUsed = usage?.bytesUsed ?? 0;
  const freeLimit = usage?.freeLimit ?? 8 * 1024 ** 3;
  const usedPct = Math.min((bytesUsed / freeLimit) * 100, 100);

  const copyUserId = async () => {
    if (!user?.id) return;
    await navigator.clipboard.writeText(user.id);
    setCopied(true);
    showNotification('User ID copied', 'success');
    setTimeout(() => setCopied(false), 1800);
  };

  return (
    <div className="min-h-screen light-mesh bg-linear-to-b from-slate-50 to-cyan-50/40 dark:bg-slate-950 transition-colors duration-300">
      <div className="max-w-3xl mx-auto px-4 py-10 sm:py-12 pb-24 sm:pb-12">
        <div className="text-center mb-8 fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-100 dark:bg-cyan-500/10 border border-cyan-200 dark:border-cyan-500/20 rounded-full text-cyan-700 dark:text-cyan-400 text-sm font-medium mb-4">
            <UserCircleIcon className="w-4 h-4" />
            Profile
          </div>
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 dark:text-white mb-2">Account overview</h1>
          <p className="text-slate-700 dark:text-slate-400 text-sm sm:text-base">Manage your account details and storage usage.</p>
        </div>

        <div className="bg-white dark:bg-white/3 border border-slate-300 dark:border-white/10 rounded-2xl p-5 sm:p-6 shadow-md dark:shadow-2xl fade-in">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/3 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                <EnvelopeIcon className="w-4 h-4" /> Email
              </p>
              <p className="text-slate-900 dark:text-white font-semibold break-all">{user?.email || '—'}</p>
            </div>

            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/3 p-4">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1.5">
                <CalendarDaysIcon className="w-4 h-4" /> Joined
              </p>
              <p className="text-slate-900 dark:text-white font-semibold">{createdAt}</p>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/3 p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <IdentificationIcon className="w-4 h-4" /> User ID
              </p>
              <button
                onClick={copyUserId}
                className="text-xs px-2.5 py-1 rounded-lg border border-slate-300 dark:border-white/15 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300 flex items-center gap-1"
              >
                {copied ? <ClipboardDocumentCheckIcon className="w-3.5 h-3.5" /> : <ClipboardDocumentIcon className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="text-slate-800 dark:text-slate-200 text-sm mt-1 break-all">{user?.id || '—'}</p>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/3 p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <ChartBarIcon className="w-4 h-4 text-indigo-500" /> Monthly usage
              </p>
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                {fmtBytes(bytesUsed)} / {fmtBytes(freeLimit)}
              </p>
            </div>

            <div className="w-full h-2.5 bg-slate-100 dark:bg-white/8 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${usedPct > 80 ? 'bg-linear-to-r from-amber-500 to-orange-500' : 'bg-linear-to-r from-indigo-500 to-cyan-500'}`}
                style={{ width: `${usedPct}%` }}
              />
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-1.5">Free tier includes 8 GB per month.</p>
          </div>

          <div className="mt-5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/3 p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <SparklesIcon className="w-4 h-4 text-indigo-500" /> Subscription details
              </p>
              <span className="text-[11px] px-2 py-1 rounded-full bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/30 font-semibold">
                Free Tier
              </span>
            </div>

            <div className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/3 p-3 mb-3">
              <p className="text-sm text-slate-800 dark:text-slate-200 font-medium">No active paid subscription</p>
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                Upgrade anytime to add monthly storage. Annual billing gives {(ANNUAL_DISCOUNT * 100).toFixed(0)}% savings.
              </p>
            </div>

            <div className="grid sm:grid-cols-2 gap-2">
              {PLAN_GB.map((gb) => {
                const monthly = gb * BASE_PER_GB_MONTH;
                const annual = monthly * 12 * (1 - ANNUAL_DISCOUNT);
                return (
                  <div key={gb} className="rounded-lg border border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/3 p-3">
                    <p className="text-sm font-semibold text-slate-900 dark:text-white">+{gb} GB</p>
                    <p className="text-xs text-slate-700 dark:text-slate-300 mt-0.5">{fmtINR(monthly)} /month</p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">{fmtINR(annual)} /year</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
