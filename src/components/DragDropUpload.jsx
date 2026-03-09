import { useCallback, useState } from 'react';
import { ArrowUpTrayIcon, DocumentIcon, XCircleIcon } from '@heroicons/react/24/outline';
import { showNotification } from './Notification';

const DEFAULT_MAX_BYTES = 8 * 1024 * 1024 * 1024; // 8 GB

export default function DragDropUpload({ onFileSelect, disabled, maxBytes }) {
  const MAX_BYTES = maxBytes ?? DEFAULT_MAX_BYTES;
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);

  const handleFile = useCallback((file) => {
    if (!file) return;
    // BUG FIX: replaced alert() with showNotification for consistent UX
    if (file.size > MAX_BYTES) {
      showNotification('File too large. Maximum size is 1 GB.', 'error');
      return;
    }
    setSelectedFile(file);
    onFileSelect(file);
  }, [onFileSelect]);

  const onDragOver = (e) => { e.preventDefault(); setDragging(true); };
  const onDragLeave = (e) => { e.preventDefault(); setDragging(false); };
  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    handleFile(e.dataTransfer.files[0]);
  };
  const onInputChange = (e) => handleFile(e.target.files[0]);

  const clearFile = () => {
    setSelectedFile(null);
    onFileSelect(null);
  };

  const formatLimit = (bytes) => {
    if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(0)} GB`;
    if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(0)} MB`;
    return `${(bytes / 1024).toFixed(0)} KB`;
  };

  return (
    <div>
      {selectedFile ? (
        /* Selected file preview — BUG FIX: uses theme-aware text colors */
        <div className="flex items-center gap-4 p-4 bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-2xl">
          <div className="w-12 h-12 rounded-xl bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
            <DocumentIcon className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-900 dark:text-white font-medium truncate">{selectedFile.name}</p>
            <p className="text-slate-500 dark:text-slate-400 text-sm">{formatLimit(selectedFile.size)}</p>
          </div>
          {!disabled && (
            <button onClick={clearFile} className="text-slate-400 hover:text-rose-500 dark:hover:text-rose-400 transition-colors flex-shrink-0">
              <XCircleIcon className="w-6 h-6" />
            </button>
          )}
        </div>
      ) : (
        /* Drop zone */
        <label
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          className={`
            flex flex-col items-center justify-center gap-4 p-10 rounded-2xl border-2 border-dashed cursor-pointer
            transition-all duration-300 group
            ${disabled
              ? 'opacity-50 cursor-not-allowed border-slate-200 dark:border-white/10'
              : dragging
              ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 glow-pulse scale-[1.01]'
              : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/2 hover:border-indigo-400 dark:hover:border-indigo-500/50 hover:bg-indigo-50 dark:hover:bg-indigo-500/5'
            }
          `}
        >
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${
            dragging
              ? 'bg-indigo-100 dark:bg-indigo-500/30 scale-110'
              : 'bg-slate-100 dark:bg-white/5 group-hover:bg-indigo-100 dark:group-hover:bg-indigo-500/15'
          }`}>
            <ArrowUpTrayIcon className={`w-8 h-8 transition-all duration-300 ${
              dragging
                ? 'text-indigo-600 dark:text-indigo-300 -translate-y-1'
                : 'text-slate-400 group-hover:text-indigo-500 dark:group-hover:text-indigo-400'
            }`} />
          </div>
          <div className="text-center">
            <p className="text-slate-800 dark:text-white font-semibold mb-1">
              {dragging ? 'Drop it here!' : 'Drag & drop your file'}
            </p>
            <p className="text-slate-500 dark:text-slate-400 text-sm">or click to browse · max {formatLimit(MAX_BYTES)}</p>
          </div>
          <input type="file" className="hidden" onChange={onInputChange} disabled={disabled} />
        </label>
      )}
    </div>
  );
}
