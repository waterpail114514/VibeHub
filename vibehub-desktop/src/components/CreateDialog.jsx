import React, { useState } from 'react';
import { useStore } from '../store';

export default function CreateDialog({ onCreated }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setShowCreate, addToast } = useStore();

  const handle = async () => {
    const n = name.trim();
    if (!n) { setError('请输入名称'); return; }
    if (n.length < 2) { setError('至少2个字符'); return; }
    setLoading(true); setError('');
    try {
      const d = await window.vibehub.createProject(n);
      await window.vibehub.setProjectPath(d.project.id, d.project.name);
      addToast({ type: 'success', message: `"${d.project.name}" 已创建` });
      setShowCreate(false);
      if (onCreated) setTimeout(onCreated, 500);
    } catch (e) { setError(e.message || '创建失败'); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center dialog-overlay"
      onClick={() => setShowCreate(false)}>
      <div className="popup-solid p-5 w-72 shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1">✨ 新建项目</h3>
        <p className="text-xs text-surface-muted mb-3">创建一个项目开始 Vibecoding</p>
        <input
          value={name} onChange={e => { setName(e.target.value); setError(''); }}
          onKeyDown={e => { if (e.key === 'Enter') handle(); if (e.key === 'Escape') setShowCreate(false); }}
          placeholder="项目名称" className="glass-input mb-2" autoFocus disabled={loading}
        />
        {error && <p className="text-xs mb-2" style={{ color: '#FF3B30' }}>{error}</p>}
        <div className="flex justify-end gap-2 mt-3">
          <button onClick={() => setShowCreate(false)} className="glass-btn text-xs">取消</button>
          <button onClick={handle} className="glass-btn primary text-xs" disabled={loading}>
            {loading ? '创建中...' : '创建'}
          </button>
        </div>
      </div>
    </div>
  );
}
