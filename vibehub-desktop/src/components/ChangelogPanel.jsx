import React, { useState, useEffect } from 'react';
import { useStore } from '../store';

export default function ChangelogPanel() {
  const { showChangelog, setShowChangelog, user, addToast } = useStore();
  const [logs, setLogs] = useState([]);
  const [text, setText] = useState('');
  const [version, setVersion] = useState('');
  const [loading, setLoading] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);

  if (!showChangelog) return null;
  const { projectId, projectName } = showChangelog;

  const load = async () => {
    try { setLogs(await window.vibehub.getChangelogs(projectId)); } catch { }
  };

  useEffect(() => { load(); }, [projectId]);

  const add = async () => {
    if (!text.trim()) return;
    setLoading(true);
    try {
      await window.vibehub.addChangelog(projectId, text.trim(), version.trim() || null, false);
      setText(''); setVersion('');
      await load();
      addToast({ type: 'success', message: '已添加更新日志' });
    } catch (e) { addToast({ type: 'error', message: e.message }); }
    finally { setLoading(false); }
  };

  const aiGen = async () => {
    setAiLoading(true);
    try {
      const r = await window.vibehub.aiExplain(projectId, 'changelog');
      setText(r.explanation);
      addToast({ type: 'info', message: 'AI 已生成草稿，可修改后保存' });
    } catch (e) { addToast({ type: 'error', message: e.message }); }
    finally { setAiLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center dialog-overlay" onClick={() => setShowChangelog(null)}>
      <div className="popup-solid p-4 w-96 h-96 flex flex-col shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">📝 {projectName} 更新日志</h3>
          <button onClick={() => setShowChangelog(null)} className="text-xs opacity-50 hover:opacity-100">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 mb-3 text-xs">
          {logs.length === 0 && <p className="text-center opacity-40 py-4">暂无更新日志</p>}
          {logs.map(l => (
            <div key={l.id} className="p-2 rounded-lg" style={{ background: 'var(--btn-bg)' }}>
              <div className="flex items-center gap-2 mb-1">
                {l.version && <span className="font-semibold">{l.version}</span>}
                <span className="text-[10px] opacity-40">{l.username} · {new Date(l.created_at * 1000).toLocaleDateString('zh-CN')}</span>
                {l.is_ai_generated ? <span className="text-[10px] px-1 rounded" style={{ background: 'rgba(0,122,255,0.1)', color: '#007AFF' }}>AI</span> : null}
              </div>
              <p className="opacity-80 whitespace-pre-wrap">{l.content}</p>
            </div>
          ))}
        </div>

        {user && (
          <div>
            <div className="flex gap-1.5 mb-1.5">
              <input value={version} onChange={e => setVersion(e.target.value)}
                placeholder="版本号 (如 v1.3)" className="glass-input text-xs w-24" />
              <button onClick={aiGen} disabled={aiLoading} className="glass-btn text-[10px] px-2 whitespace-nowrap">
                {aiLoading ? '...' : '🤖 AI 生成'}
              </button>
            </div>
            <div className="flex gap-1.5">
              <textarea value={text} onChange={e => setText(e.target.value)}
                placeholder="更新内容..." className="glass-input text-xs flex-1 resize-none" rows={2} disabled={loading} />
              <button onClick={add} disabled={loading || !text.trim()} className="glass-btn primary text-xs px-3">保存</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
