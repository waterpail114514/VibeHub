import React, { useState, useEffect } from 'react';
import { useStore } from '../store';

export default function SettingsDialog({ onSave }) {
  const { setShowSettings, darkMode, setDarkMode, user } = useStore();
  const [syncRoot, setSyncRoot] = useState('');
  const [aiKey, setAiKey] = useState('');
  const [aiUrl, setAiUrl] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    window.vibehub?.getConfig().then(c => {
      setSyncRoot(c.syncRoot || '');
      setAiKey(c.aiApiKey || '');
      setAiUrl(c.aiBaseUrl || '');
      setAiModel(c.aiModel || '');
    });
  }, []);

  const browse = async () => {
    const dir = await window.vibehub.browseFolder();
    if (dir) setSyncRoot(dir);
  };

  const save = async () => {
    setSaving(true);
    try {
      await window.vibehub.saveConfig({
        syncRoot: syncRoot || undefined,
        aiApiKey: aiKey || undefined, aiBaseUrl: aiUrl || undefined, aiModel: aiModel || undefined,
        darkMode,
      });
      setShowSettings(false);
      if (onSave) onSave();
    } finally { setSaving(false); }
  };

  const presets = [
    { label: 'Codex (OpenAI兼容)', url: 'https://api.openai.com', model: 'gpt-4o-mini' },
    { label: 'Claude Code', url: 'https://api.anthropic.com', model: 'claude-sonnet-4-6' },
    { label: '自定义', url: '', model: '' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center dialog-overlay" onClick={() => setShowSettings(false)}>
      <div className="popup-solid p-5 w-80 max-h-[75vh] overflow-y-auto shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-3">⚙ 设置</h3>

        {/* Sync Dir */}
        <label className="text-xs font-medium block mb-1">同步目录</label>
        <div className="flex gap-1.5 mb-3">
          <input value={syncRoot} onChange={e => setSyncRoot(e.target.value)} placeholder="文档/VibeHubProjects" className="glass-input flex-1 text-xs" />
          <button onClick={browse} className="glass-btn text-[11px] px-2 whitespace-nowrap">浏览</button>
        </div>

        {/* AI Settings */}
        <div className="pt-2 border-t border-surface-border">
          <label className="text-xs font-medium block mb-1">🤖 AI 更新解读</label>
          <div className="flex gap-1.5 mb-2">
            {presets.map(p => (
              <button key={p.label} onClick={() => { setAiUrl(p.url); setAiModel(p.model); }}
                className="glass-btn text-[10px] px-2 py-0.5">{p.label}</button>
            ))}
          </div>
          <input value={aiUrl} onChange={e => setAiUrl(e.target.value)}
            placeholder="Base URL (如 https://api.openai.com)" className="glass-input text-xs mb-1.5" />
          <input value={aiKey} onChange={e => setAiKey(e.target.value)}
            type="password" placeholder="API Key" className="glass-input text-xs mb-1.5" />
          <input value={aiModel} onChange={e => setAiModel(e.target.value)}
            placeholder="模型名 (如 gpt-4o-mini)" className="glass-input text-xs mb-1" />
          <p className="text-[10px] text-surface-muted">兼容 OpenAI 和 Anthropic 格式。点击预设自动填入。</p>
        </div>

        <div className="pt-2 border-t border-surface-border mt-2">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="text-xs">🌙 暗色模式</span>
            <button onClick={() => setDarkMode(!darkMode)} className="text-xs px-2 py-1 rounded" style={{ background: darkMode ? 'rgba(0,122,255,0.12)' : 'rgba(0,0,0,0.06)', color: darkMode ? '#007AFF' : '#86868b' }}>
              {darkMode ? '开' : '关'}
            </button>
          </label>
        </div>

        {user && (
          <div className="pt-2 border-t border-surface-border mt-2">
            <p className="text-xs">当前登录: <span className="font-medium">{user.username}</span></p>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button onClick={() => setShowSettings(false)} className="glass-btn text-xs">取消</button>
          <button onClick={save} className="glass-btn primary text-xs" disabled={saving}>{saving ? '...' : '保存'}</button>
        </div>
      </div>
    </div>
  );
}
