import { useState } from 'react';
import { supabase } from '../supabaseClient';
import DragDropUpload from './DragDropUpload';
import ProgressBar from './ProgressBar';
import { showNotification } from './Notification';
import { ClipboardDocumentIcon, ClipboardDocumentCheckIcon, CloudArrowUpIcon, LockClosedIcon } from '@heroicons/react/24/outline';

const API_BASE = import.meta.env.VITE_API_URL || '';

export default function SenderPage() {
  const [file, setFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null); // { passcode, filename, size, expiresAt }
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState('');

  const handleUpload = async () => {
    if (!file) return;
    setError('');
    setUploading(true);
    setProgress(0);
    setResult(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const formData = new FormData();
      formData.append('file', file);

      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE}/api/upload`);
      xhr.setRequestHeader('Authorization', `Bearer ${session.access_token}`);

      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          setProgress((e.loaded / e.total) * 100);
        }
      };

      xhr.onload = () => {
        setUploading(false);
        if (xhr.status === 200) {
          const data = JSON.parse(xhr.responseText);
          setResult(data);
          setFile(null);
          showNotification('File uploaded successfully!', 'success');
        } else {
          const data = JSON.parse(xhr.responseText);
          setError(data.error || 'Upload failed');
          showNotification(data.error || 'Upload failed', 'error');
        }
      };

      xhr.onerror = () => {
        setUploading(false);
        setError('Network error during upload');
        showNotification('Network error during upload', 'error');
      };

      xhr.send(formData);
    } catch (err) {
      setUploading(false);
      setError(err.message);
      showNotification(err.message, 'error');
    }
  };

  const copyPasscode = async () => {
    if (!result?.passcode) return;
    await navigator.clipboard.writeText(result.passcode);
    setCopied(true);
    showNotification('Passcode copied to clipboard!', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const formatExpiry = (isoStr) => {
    if (!isoStr) return '';
    return new Date(isoStr).toLocaleString();
  };

  return (
    <div className="min-h-screen bg-slate-950 dark:bg-slate-950">
      <div className="max-w-2xl mx-auto px-4 py-12">
        {/* Heading */}
        <div className="text-center mb-10 fade-in">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-500/10 border border-indigo-500/20 rounded-full text-indigo-400 text-sm font-medium mb-4">
            <CloudArrowUpIcon className="w-4 h-4" />
            Send a File
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">
            Share anything,{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-indigo-400 to-purple-400">
              securely
            </span>
          </h1>
          <p className="text-slate-400">
            Upload a file and get an 8-digit passcode to share with the recipient.
          </p>
        </div>

        {/* Upload card */}
        <div className="bg-white/3 backdrop-blur-xl border border-white/8 rounded-2xl p-6 fade-in shadow-2xl">
          <DragDropUpload onFileSelect={setFile} disabled={uploading} />

          {file && !uploading && (
            <button
              onClick={handleUpload}
              className="mt-4 w-full py-3.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 transition-all duration-200 flex items-center justify-center gap-2"
            >
              <CloudArrowUpIcon className="w-5 h-5" />
              Upload & Generate Passcode
            </button>
          )}

          {uploading && (
            <div className="mt-4">
              <ProgressBar progress={progress} />
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-rose-400 text-sm">
              ⚠ {error}
            </div>
          )}
        </div>

        {/* Success card */}
        {result && (
          <div className="mt-6 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-6 fade-in">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <p className="text-emerald-400 font-semibold">File uploaded successfully!</p>
            </div>

            <p className="text-slate-400 text-sm mb-1">{result.filename}</p>
            <p className="text-slate-500 text-xs mb-4">
              {formatSize(result.size)} · Expires: {formatExpiry(result.expiresAt)}
            </p>

            {/* Passcode display */}
            <div className="text-center mb-4">
              <p className="text-slate-400 text-sm mb-2 flex items-center justify-center gap-1">
                <LockClosedIcon className="w-4 h-4" />
                Passcode
              </p>
              <div className="flex items-center justify-center gap-2 flex-wrap">
                {result.passcode.split('').map((digit, i) => (
                  <div
                    key={i}
                    className="w-12 h-14 rounded-xl bg-white/8 border border-white/15 flex items-center justify-center text-2xl font-bold text-white float-anim"
                    style={{ animationDelay: `${i * 0.08}s` }}
                  >
                    {digit}
                  </div>
                ))}
              </div>
            </div>

            {/* Copy button */}
            <button
              onClick={copyPasscode}
              className={`w-full py-3 rounded-xl font-medium text-sm transition-all duration-200 flex items-center justify-center gap-2 ${
                copied
                  ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-400'
                  : 'bg-white/5 border border-white/10 hover:bg-white/10 text-slate-300 hover:text-white'
              }`}
            >
              {copied ? (
                <><ClipboardDocumentCheckIcon className="w-4 h-4" /> Copied!</>
              ) : (
                <><ClipboardDocumentIcon className="w-4 h-4" /> Copy Passcode</>
              )}
            </button>

            <p className="text-center text-slate-500 text-xs mt-4">
              Share this passcode with the recipient. They can use it at{' '}
              <span className="text-indigo-400">/receive</span>.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
