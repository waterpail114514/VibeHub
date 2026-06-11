import React, { useState, useEffect } from 'react';
import { useStore } from '../store';
import { fmtSize } from '../utils';

export default function UploadConfirmDialog({ onConfirm, onCancel }) {
  const { showUpload, setShowUpload, addToast } = useStore();
  if (!showUpload) return null;
  const { projectId, projectName, diff } = showUpload;
  const [selected, setSelected] = useState({});
  const [loading, setLoading] = useState(false);
  const [previews, setPreviews] = useState({});
  const [progress, setProgress] = useState(null);
  const allFiles = [...(diff.added || []), ...(diff.changed || []), ...(diff.deleted || [])];

  useEffect(() => {
    const s = {};
    allFiles.forEach(f => { s[f] = true; });
    setSelected(s);
  }, [showUpload]);

  const toggleFile = (f) => setSelected(prev => ({ ...prev, [f]: !prev[f] }));
  const togglePreview = async (f) => {
    if (previews[f]) { const p = { ...previews }; delete p[f]; setPreviews(p); return; }
    if (!window.vibehub) return;
    const d = await window.vibehub.getDiff(projectId);
    setPreviews({ ...previews, [f]: d.diffs?.[f] || '+binary file' });
  };

  // Listen for upload progress IPC
  useEffect(() => {
    if (!loading) return;
    const handler = (data) => {
      if (data.projectId === projectId) setProgress({ sent: data.sent, total: data.total });
    };
    if (window.vibehub?.onUploadProgress) {
      window.vibehub.onUploadProgress(handler);
      return () => window.vibehub.removeUploadProgress?.();
    }
  }, [loading, projectId]);

  const handleUpload = async () => {
    const files = allFiles.filter(f => selected[f]);
    if (files.length === 0) { addToast({ type: 'info', message: '未选择任何文件' }); return; }
    setLoading(true);
    setProgress(null);
    try {
      if (onConfirm) await onConfirm(files);
    } catch (e) { addToast({ type: 'error', message: e.message }); }
    finally { setLoading(false); setProgress(null); setShowUpload(null); }
  };

  const selectedFiles = allFiles.filter(f => selected[f]);
  const totalSize = selectedFiles.reduce((s, f) => s + (diff.fileSizes?.[f] || 0), 0) || diff.totalSize || 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center dialog-overlay" onClick={() => { if (!loading) setShowUpload(null); }}>
      <div className="popup-solid p-5 w-96 max-h-[75vh] overflow-y-auto shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1">确认上传 - {projectName}</h3>
        <p className="text-xs text-surface-muted mb-3">
          {selectedFiles.length}/{allFiles.length} 个文件 · {fmtSize(totalSize)}
        </p>

        <div className="space-y-1 max-h-80 overflow-y-auto mb-3">
          {allFiles.map(f => {
            const isNew = diff.added?.includes(f);
            const isMod = diff.changed?.includes(f);
            const isDel = diff.deleted?.includes(f);
            return (
              <div key={f}>
                <label className="flex items-center gap-2 py-1.5 px-2 rounded-lg hover:bg-black/5 cursor-pointer text-xs">
                  <input type="checkbox" checked={selected[f] || false} onChange={() => toggleFile(f)} className="shrink-0" />
                  <span className="font-mono truncate flex-1">{f}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full shrink-0"
                    style={{ background: isNew ? 'rgba(52,199,89,0.12)' : isDel ? 'rgba(255,59,48,0.12)' : 'rgba(255,149,0,0.12)', color: isNew ? '#1B8731' : isDel ? '#FF3B30' : '#C93400' }}>
                    {isNew ? '新增' : isDel ? '删除' : '修改'}
                  </span>
                  {(isMod || isNew) && <button onClick={() => togglePreview(f)} className="text-[10px] opacity-50 hover:opacity-100">
                    {previews[f] ? '收起' : '预览'}
                  </button>}
                </label>
                {previews[f] && (
                  <pre className="text-[10px] font-mono bg-black/5 rounded-lg p-2 ml-6 mb-1 max-h-32 overflow-y-auto whitespace-pre-wrap">{previews[f]}</pre>
                )}
              </div>
            );
          })}
        </div>

        {loading && (
          <div className="mb-3 px-3 py-2 rounded-lg" style={{ background: 'rgba(0,122,255,0.08)', color: '#007AFF' }}>
            <div className="flex items-center gap-2 mb-1">
              <span className="w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
              <span className="text-xs">{progress?.retrying ? `连接断开，正在重试 (第${progress.attempt}次)...` : '上传中，请不要关闭窗口...'}</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(0,0,0,0.08)' }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: progress ? `${Math.min((progress.sent / progress.total) * 100, 95)}%` : '20%', background: 'linear-gradient(90deg, #007AFF, #5856D6)', animation: progress ? 'none' : 'pulse 2s ease-in-out infinite' }} />
            </div>
            <div className="text-[10px] mt-1 opacity-70">
              {progress ? `${fmtSize(progress.sent)} / ${fmtSize(progress.total)}` : `共 ${fmtSize(totalSize)}`}
            </div>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button onClick={onCancel || (() => setShowUpload(null))} disabled={loading} className="glass-btn text-xs">取消</button>
          <button onClick={handleUpload} disabled={loading || selectedFiles.length === 0} className="glass-btn primary text-xs">
            {loading ? '上传中...' : `上传 (${selectedFiles.length})`}
          </button>
        </div>
      </div>
    </div>
  );
}
