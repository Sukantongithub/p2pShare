import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { useTheme } from '../context/ThemeContext';
import {
  SunIcon, MoonIcon, ArrowRightOnRectangleIcon, ShareIcon,
  CloudArrowUpIcon, CloudArrowDownIcon,
} from '@heroicons/react/24/outline';

export default function Navbar() {
  const { user, signOut } = useAuth();
  const { dark, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const location = useLocation();

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  const tabs = [
    { to: '/', label: 'Send', icon: CloudArrowUpIcon },
    { to: '/receive', label: 'Receive', icon: CloudArrowDownIcon },
  ];

  return (
    <>
      {/* ── Slim top bar (logo only) ── */}
      <nav className="sticky top-0 z-50 border-b border-slate-200 dark:border-white/10 backdrop-blur-xl bg-white/90 dark:bg-slate-900/80 transition-colors duration-300">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center shadow-md shadow-indigo-500/25">
              <ShareIcon className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold text-base text-slate-900 dark:text-white tracking-tight">
              P2P<span className="text-indigo-500">Share</span>
            </span>
            <span className="ml-1 px-2 py-0.5 bg-emerald-100 dark:bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 text-[10px] font-bold rounded-full border border-emerald-200 dark:border-emerald-500/30 uppercase tracking-wide">
              1 GB Free
            </span>
          </Link>

          {/* Right: theme + sign out */}
          <div className="flex items-center gap-1">
            <button
              onClick={toggleTheme}
              className="p-2 rounded-lg text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-all duration-200"
              aria-label="Toggle theme"
            >
              {dark ? <SunIcon className="w-5 h-5" /> : <MoonIcon className="w-5 h-5" />}
            </button>
            {user && (
              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-slate-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-500/10 transition-all duration-200"
              >
                <ArrowRightOnRectangleIcon className="w-4 h-4" />
                <span className="hidden sm:inline text-sm">Sign out</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* ── iPhone-style bottom tab bar (all screen sizes) ── */}
      <div className="fixed bottom-0 left-0 right-0 z-50 px-4 pb-4 pt-2 pointer-events-none">
        <div className="pointer-events-auto max-w-xs mx-auto">
          <div className="flex items-stretch gap-1 p-1.5 rounded-2xl bg-white/80 dark:bg-slate-800/80 backdrop-blur-2xl border border-slate-200/80 dark:border-white/10 shadow-xl shadow-black/10 dark:shadow-black/40">
            {tabs.map(({ to, label, icon: Icon }) => {
              const active = isActive(to);
              return (
                <Link
                  key={to}
                  to={to}
                  className={`
                    flex-1 flex flex-col items-center justify-center gap-1 py-2.5 px-4 rounded-xl text-[11px] font-semibold
                    transition-all duration-200
                    ${active
                      ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/30'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10'
                    }
                  `}
                >
                  <Icon className={`w-5 h-5 transition-transform duration-200 ${active ? 'scale-110' : ''}`} />
                  {label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
