import { useRef, useState } from 'react';
import axios from 'axios';
import DownloadCart from './DownloadCart';
import { showNotification } from './Notification';
import { LockOpenIcon, DocumentIcon, ArrowDownTrayIcon } from '@heroicons/react/24/outline';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function ReceiverPage() {
  const [passcode, setPasscode] = useState(Array(8).fill(''));
  const [loading, setLoading] = useState(false);
  const [fileInfo, setFileInfo] = useState(null);
  const [error, setError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const inputRefs = useRef([]);

  const handleDigitChange = (index, value) => {
    if (!/^\d*$/.test(value)) return; // digits only
    const updated = [...passcode];
    updated[index] = value.slice(-1);
    setPasscode(updated);
    if (value && index < 7) inputRefs.current[index + 1]?.focus();
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !passcode[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === 'Enter') handleFetch();
  };

  const handlePaste = (e) => {
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 8);
    if (pasted.length === 8) {
      setPasscode(pasted.split(''));
      inputRefs.current[7]?.focus();
    }
    e.preventDefault();
  };

  const handleFetch = async () => {
    const code = passcode.join('');
    if (code.length !== 8) {
      setError('Please enter all 8 digits');
      return;
    }
    setError('');
    setLoading(true);
    setFileInfo(null);
    try {
      const { data } = await axios.get(`${API_BASE}/api/download/${code}`);
      setFileInfo(data);
      showNotification(`Found: ${data.filename}`, 'success');
    } catch (err) {
      const msg = err.response?.data?.error || 'Failed to fetch file. Check your passcode.';
      setError(msg);
      showNotification(msg, 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="min-h-screen bg-slate-950 dark:bg-slate-950">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Heading */}
        <div className="text-center mb-10 fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-500/10 border border-purple-500/20 rounded-full text-purple-400 text-sm font-medium mb-4">
            <LockOpenIcon className="w-4 h-4" />
            Receive a File
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">
            Enter your{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-400">
              passcode
            </span>
          </h1>
          <p className="text-slate-400">
            Enter the 8-digit passcode you received to access the file.
          </p>
        </div>

        {/* Passcode input card */}
        <div className="bg-white/3 backdrop-blur-xl border border-white/8 rounded-2xl p-6 fade-in shadow-2xl mb-6">
          <p className="text-slate-400 text-sm text-center mb-4">Enter passcode</p>

          {/* 8 digit inputs */}
          <div className="flex gap-2 justify-center mb-6 flex-wrap" onPaste={handlePaste}>
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
                  w-11 h-14 text-center text-xl font-bold rounded-xl border transition-all duration-200 bg-white/5 text-white outline-none
                  ${digit
                    ? 'border-indigo-500/60 bg-indigo-500/10 text-indigo-300'
                    : 'border-white/10 focus:border-indigo-500/50 focus:bg-indigo-500/5'
                  }
                `}
              />
            ))}
          </div>

          {error && (
            <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm text-center">
              ⚠ {error}
            </div>
          )}

          <button
            onClick={handleFetch}
            disabled={loading || passcode.some((d) => !d)}
            className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-500 hover:to-pink-500 disabled:opacity-40 disabled:cursor-not-allowed text-white font-semibold rounded-xl shadow-lg shadow-purple-500/25 hover:shadow-purple-500/40 transition-all duration-200 flex items-center justify-center gap-2"
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                </svg>
                Fetching file...
              </span>
            ) : (
              <><LockOpenIcon className="w-5 h-5" /> Unlock File</>
            )}
          </button>
        </div>

        {/* File card + Download cart */}
        {fileInfo && (
          <div className="space-y-4 fade-in">
            {/* Draggable file card */}
            <div
              draggable
              onDragStart={() => setIsDragging(true)}
              onDragEnd={() => setIsDragging(false)}
              className={`
                bg-white/3 border border-white/10 rounded-2xl p-5 cursor-grab active:cursor-grabbing
                transition-all duration-300 float-anim
                ${isDragging ? 'opacity-60 scale-95 rotate-1' : 'hover:border-white/20 hover:bg-white/5'}
              `}
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-indigo-500/20 to-purple-500/20 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <DocumentIcon className="w-7 h-7 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-white font-semibold truncate">{fileInfo.filename}</p>
                  <p className="text-slate-400 text-sm">{formatSize(fileInfo.size)}</p>
                  <p className="text-slate-600 text-xs mt-0.5">
                    Expires: {new Date(fileInfo.expiresAt).toLocaleString()}
                  </p>
                </div>
                <ArrowDownTrayIcon className="w-5 h-5 text-slate-500 flex-shrink-0" />
              </div>
              <p className="text-slate-600 text-xs text-center mt-3">
                ↕ Drag this card into the download zone below
              </p>
            </div>

            {/* Download cart */}
            <DownloadCart fileInfo={fileInfo} />
          </div>
        )}
      </div>
    </div>
  );
}
