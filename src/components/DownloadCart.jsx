import { useState } from 'react';
import { ArrowDownTrayIcon, ShoppingCartIcon, CheckCircleIcon } from '@heroicons/react/24/outline';
import { showNotification } from './Notification';

export default function DownloadCart({ fileInfo }) {
  const [draggingOver, setDraggingOver] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const triggerDownload = () => {
    if (!fileInfo?.signedUrl) return;
    const a = document.createElement('a');
    a.href = fileInfo.signedUrl;
    a.download = fileInfo.filename || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setDownloaded(true);
    showNotification(`"${fileInfo.filename}" download started!`, 'success');
    setTimeout(() => setDownloaded(false), 4000);
  };

  const onDragOver = (e) => { e.preventDefault(); setDraggingOver(true); };
  const onDragLeave = () => setDraggingOver(false);
  const onDrop = (e) => {
    e.preventDefault();
    setDraggingOver(false);
    triggerDownload();
  };

  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`
        relative rounded-2xl border-2 border-dashed transition-all duration-300 overflow-hidden
        ${downloaded
          ? 'border-emerald-400 dark:border-emerald-500/50 bg-emerald-50 dark:bg-emerald-500/10'
          : draggingOver
          ? 'border-indigo-400 bg-indigo-50 dark:bg-indigo-500/15 glow-pulse scale-[1.02]'
          : 'border-slate-200 dark:border-white/10 bg-slate-50 dark:bg-white/3 hover:border-slate-300 dark:hover:border-white/20'
        }
      `}
    >
      {/* Shimmer effect when dragging over */}
      {draggingOver && <div className="absolute inset-0 shimmer pointer-events-none" />}

      <div className="flex flex-col items-center justify-center gap-3 p-8">
        {downloaded ? (
          <>
            <CheckCircleIcon className="w-10 h-10 text-emerald-400" />
            <p className="text-emerald-700 dark:text-emerald-400 font-semibold">Download started!</p>
          </>
        ) : draggingOver ? (
          <>
            <ArrowDownTrayIcon className="w-10 h-10 text-indigo-400 animate-bounce" />
            <p className="text-indigo-600 dark:text-indigo-300 font-semibold">Release to download</p>
          </>
        ) : (
          <>
            <ShoppingCartIcon className="w-10 h-10 text-slate-500" />
            <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">Drag file card here to download</p>
          </>
        )}
      </div>

      {/* Alternative: click to download button */}
      {!downloaded && fileInfo && (
        <div className="px-6 pb-5 -mt-2">
          <button
            onClick={triggerDownload}
            className="w-full py-2.5 px-4 bg-indigo-600/20 hover:bg-indigo-600/40 border border-indigo-500/30 hover:border-indigo-500/60 rounded-xl text-indigo-300 hover:text-indigo-200 text-sm font-medium transition-all duration-200 flex items-center justify-center gap-2"
          >
            <ArrowDownTrayIcon className="w-4 h-4" />
            Click to download
          </button>
        </div>
      )}
    </div>
  );
}
