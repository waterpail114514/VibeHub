import React from 'react';
import { useStore } from '../store';

export default function HistoryDialog() {
  const { showHistory, setShowHistory } = useStore();
  if (!showHistory) return null;
  const { projectName, history } = showHistory;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center dialog-overlay" onClick={() => setShowHistory(null)}>
      <div className="popup-solid p-5 w-80 max-h-[60vh] overflow-y-auto shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1">📋 {projectName} 编辑历史</h3>
        <p className="text-xs text-surface-muted mb-3">从创建至今的所有编辑记录</p>

        {(!history || history.length === 0) ? (
          <p className="text-xs text-surface-muted text-center py-4">暂无编辑记录</p>
        ) : (
          <div className="relative pl-5 border-l-2 border-surface-border space-y-3">
            {history.map((h, i) => (
              <div key={h.id} className="relative">
                <div className="absolute -left-[25px] w-3 h-3 rounded-full mt-1"
                  style={{ background: i === 0 ? '#007AFF' : i === 1 ? '#34C759' : '#86868b' }} />
                <div className="text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{h.username}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full"
                      style={{
                        background: h.action === '创建' ? 'rgba(52,199,89,0.12)' : h.action === '删除' ? 'rgba(255,59,48,0.12)' : 'rgba(0,122,255,0.10)',
                        color: h.action === '创建' ? '#1B8731' : h.action === '删除' ? '#FF3B30' : '#007AFF'
                      }}>{h.action}</span>
                  </div>
                  <p className="text-surface-muted mt-0.5">{h.summary}</p>
                  <p className="text-[10px] text-surface-muted mt-0.5">
                    {new Date(h.created_at * 1000).toLocaleString('zh-CN')}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button onClick={() => setShowHistory(null)} className="glass-btn primary text-xs">关闭</button>
        </div>
      </div>
    </div>
  );
}
