import React, { useState, useEffect } from 'react';
import { useStore } from '../store';

function fmtSize(b) {
  if (!b) return '0B';
  if (b < 1024) return b + 'B';
  if (b < 1024 * 1024) return (b / 1024).toFixed(1) + 'KB';
  return (b / 1024 / 1024).toFixed(1) + 'MB';
}

export default function SyncConfirmDialog() {
  const { showConfirmPull, setShowConfirmPull, addToast } = useStore();
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  if (!showConfirmPull) return null;
  const { projectName, diff, onDone } = showConfirmPull;
  const dl = diff?.toDownload || [];
  const del = diff?.toDeleteLocally || [];

  const { projectId } = showConfirmPull;
  useEffect(() => {
    if (!loading) return;
    const h = (data) => { if (data.projectId === projectId) setProgress({ done: data.done, total: data.total }); };
    window.vibehub?.onPullProgress?.(h);
    return () => window.vibehub?.removePullProgress?.();
  }, [loading, projectId]);

  const handleSync = async () => {
    setLoading(true);
    try { if (onDone) await onDone(); setShowConfirmPull(null); }
    catch (e) { addToast({ type: 'error', message: e.message }); setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center dialog-overlay" onClick={() => !loading && setShowConfirmPull(null)}>
      <div className="popup-solid p-5 w-96 max-h-[70vh] overflow-y-auto shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1">确认同步 - {projectName}</h3>
        <p className="text-xs opacity-50 mb-3">
          {dl.length > 0 && `${dl.length} 个文件下载`}{dl.length > 0 && del.length > 0 && '，'}{del.length > 0 && `${del.length} 个文件删除`}
        </p>

        <div className="space-y-0.5 max-h-60 overflow-y-auto mb-3 text-xs font-mono">
          {dl.map(f => <div key={f} className="px-2 py-0.5 rounded" style={{ color: '#007AFF', background: 'rgba(0,122,255,0.05)' }}>↓ {f}</div>)}
          {del.map(f => <div key={f} className="px-2 py-0.5 rounded" style={{ color: '#FF3B30', background: 'rgba(255,59,48,0.05)' }}>✕ {f}</div>)}
        </div>

        {loading && (
          <div className="mb-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(0,122,255,0.08)', color: '#007AFF' }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">同步中... {progress ? `${fmtSize(progress.done)} / ${fmtSize(progress.total)}` : ''}</span>
            </div>
            {progress && (
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
                <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min((progress.done / progress.total) * 100, 100)}%`, background: 'linear-gradient(90deg, #007AFF, #34C759)' }} />
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button onClick={() => setShowConfirmPull(null)} disabled={loading} className="glass-btn text-xs">取消</button>
          <button onClick={handleSync} disabled={loading} className="glass-btn primary text-xs">
            {loading ? '同步中...' : '确认同步'}
          </button>
        </div>
      </div>
    </div>
  );
}
