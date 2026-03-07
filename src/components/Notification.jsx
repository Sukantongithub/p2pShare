import { useEffect, useState } from 'react';
import { CheckIcon, XMarkIcon } from '@heroicons/react/24/outline';

const ICONS = {
  success: '✅',
  error: '❌',
  info: 'ℹ️',
};

const COLORS = {
  success: 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-200 dark:border-emerald-500/20 text-emerald-700 dark:text-emerald-300',
  error: 'bg-rose-50 dark:bg-rose-500/10 border-rose-200 dark:border-rose-500/20 text-rose-700 dark:text-rose-300',
  info: 'bg-indigo-50 dark:bg-indigo-500/10 border-indigo-200 dark:border-indigo-500/20 text-indigo-700 dark:text-indigo-300',
};

// Singleton notification manager
let addToast = null;
export function showNotification(message, type = 'info') {
  addToast?.({ message, type, id: Date.now() });
}

export default function Notification() {
  const [toasts, setToasts] = useState([]);

  useEffect(() => {
    addToast = (toast) => {
      setToasts((prev) => [...prev, toast]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== toast.id));
      }, 4000);
    };
    return () => { addToast = null; };
  }, []);

  const dismiss = (id) => setToasts((prev) => prev.filter((t) => t.id !== id));

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`flex items-center gap-3 px-4 py-3 rounded-xl border backdrop-blur-xl shadow-xl pointer-events-auto fade-in ${COLORS[toast.type]}`}
          style={{ minWidth: 280, maxWidth: 380 }}
        >
          <span className="text-lg">{ICONS[toast.type]}</span>
          <span className="flex-1 text-sm font-medium">{toast.message}</span>
          <button onClick={() => dismiss(toast.id)} className="text-current opacity-60 hover:opacity-100 transition-opacity">
            <XMarkIcon className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
