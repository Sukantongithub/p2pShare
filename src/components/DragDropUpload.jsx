import { useCallback, useState } from 'react';
import { ArrowUpTrayIcon, DocumentIcon, XCircleIcon } from '@heroicons/react/24/outline';

export default function DragDropUpload({ onFileSelect, disabled }) {
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const MAX_MB = 3 * 1024; // 3 GB in MB

  const handleFile = useCallback((file) => {
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      alert(`File too large. Maximum size is ${MAX_MB} MB.`);
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
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };
  const onInputChange = (e) => {
    const file = e.target.files[0];
    handleFile(file);
  };

  const clearFile = () => {
    setSelectedFile(null);
    onFileSelect(null);
  };

  return (
    <div>
      {selectedFile ? (
        /* Selected file preview */
        <div className="flex items-center gap-4 p-4 bg-indigo-500/10 border border-indigo-500/30 rounded-2xl">
          <div className="w-12 h-12 rounded-xl bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
            <DocumentIcon className="w-6 h-6 text-indigo-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-medium truncate">{selectedFile.name}</p>
            <p className="text-slate-400 text-sm">{(selectedFile.size / 1024 / 1024).toFixed(2)} MB</p>
          </div>
          {!disabled && (
            <button onClick={clearFile} className="text-slate-500 hover:text-rose-400 transition-colors flex-shrink-0">
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
            ${dragging
              ? 'border-indigo-400 bg-indigo-500/10 glow-pulse scale-[1.01]'
              : 'border-white/10 bg-white/2 hover:border-indigo-500/50 hover:bg-indigo-500/5'
            }
          `}
        >
          <div className={`w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-300 ${
            dragging ? 'bg-indigo-500/30 scale-110' : 'bg-white/5 group-hover:bg-indigo-500/15'
          }`}>
            <ArrowUpTrayIcon className={`w-8 h-8 transition-all duration-300 ${
              dragging ? 'text-indigo-300 -translate-y-1' : 'text-slate-400 group-hover:text-indigo-400'
            }`} />
          </div>
          <div className="text-center">
            <p className="text-white font-semibold mb-1">
              {dragging ? 'Drop it here!' : 'Drag & drop your file'}
            </p>
            <p className="text-slate-500 text-sm">or click to browse · max 3 GB</p>
          </div>
          <input type="file" className="hidden" onChange={onInputChange} disabled={disabled} />
        </label>
      )}
    </div>
  );
}
