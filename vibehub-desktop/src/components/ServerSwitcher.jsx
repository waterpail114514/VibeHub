import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';

export default function ServerSwitcher() {
  const [open, setOpen] = useState(false);
  const [servers, setServers] = useState([]);
  const [activeId, setActiveId] = useState('default');
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [menuServer, setMenuServer] = useState(null);
  const [editing, setEditing] = useState(null);
  const [editName, setEditName] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const ref = useRef(null);
  const hoverTimer = useRef(null);

  const load = async () => {
    const cfg = await window.vibehub.getConfig();
    setServers(cfg.servers || [{ id: 'default', name: '默认', url: cfg.serverUrl || 'http://localhost:3456' }]);
    setActiveId(cfg.activeServer || 'default');
  };

  useEffect(() => { if (open) load(); }, [open]);

  const switchTo = async (id) => {
    await window.vibehub.saveConfig({ activeServer: id });
    setActiveId(id);
    setOpen(false);
    useStore.getState().setServerOnline(false);
    window.location.reload();
  };

  const add = async () => {
    if (!newName.trim() || !newUrl.trim()) return;
    const cfg = await window.vibehub.getConfig();
    const id = 'srv_' + Date.now();
    const updated = [...(cfg.servers || []), { id, name: newName.trim(), url: newUrl.trim() }];
    await window.vibehub.saveConfig({ servers: updated, activeServer: id });
    setAdding(false); setNewName(''); setNewUrl('');
    load();
  };

  const remove = async (id) => {
    const cfg = await window.vibehub.getConfig();
    const updated = (cfg.servers || []).filter(s => s.id !== id);
    const newActive = cfg.activeServer === id ? (updated[0]?.id || 'default') : cfg.activeServer;
    await window.vibehub.saveConfig({ servers: updated, activeServer: newActive });
    setMenuServer(null);
    if (cfg.activeServer === id) { setActiveId(newActive); window.location.reload(); }
    else load();
  };

  const startEdit = (s) => { setEditing(s.id); setEditName(s.name); setEditUrl(s.url); setMenuServer(null); };
  const saveEdit = async (id) => {
    const cfg = await window.vibehub.getConfig();
    const updated = (cfg.servers || []).map(s => s.id === id ? { ...s, name: editName.trim(), url: editUrl.trim() } : s);
    await window.vibehub.saveConfig({ servers: updated });
    setEditing(null); load();
  };

  const manageServer = async (s) => {
    setMenuServer(null);
    setOpen(false); // close dropdown
    useStore.getState().setShowManage({ serverName: s.name, serverId: s.id });
  };

  // Hover handlers
  const onEnter = () => { clearTimeout(hoverTimer.current); setOpen(true); };
  const onLeave = () => { hoverTimer.current = setTimeout(() => { setOpen(false); setMenuServer(null); }, 300); };

  const active = servers.find(s => s.id === activeId) || servers[0] || { name: '未知' };

  return (
    <div className="relative" ref={ref} onMouseEnter={onEnter} onMouseLeave={onLeave}>
      <button className="titlebar-btn text-[12px] font-semibold px-2 py-0.5 rounded hover:opacity-80" style={{ background: 'var(--btn-bg)', opacity: 0.8 }}>
        {active.name} ▼
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-1 w-64 popup-solid p-2 z-[999] shadow-xl animate-slide-up"
          onMouseEnter={() => clearTimeout(hoverTimer.current)}
          onMouseLeave={onLeave}>
          {servers.map(s => (
            <div key={s.id} className="flex items-center gap-1 mb-0.5">
              {editing === s.id ? (
                <div className="flex-1 flex gap-1">
                  <input value={editName} onChange={e => setEditName(e.target.value)} className="glass-input text-xs flex-1" />
                  <input value={editUrl} onChange={e => setEditUrl(e.target.value)} className="glass-input text-xs flex-1" />
                  <button onClick={() => saveEdit(s.id)} className="glass-btn text-[10px] px-1">保存</button>
                  <button onClick={() => setEditing(null)} className="glass-btn text-[10px] px-1">取消</button>
                </div>
              ) : (
                <>
                  <button onClick={() => switchTo(s.id)}
                    className={`flex-1 text-left text-xs px-2 py-1.5 rounded-lg ${s.id === activeId ? 'font-semibold' : ''}`}
                    style={{ background: s.id === activeId ? 'rgba(0,122,255,0.08)' : 'transparent', color: s.id === activeId ? '#007AFF' : 'var(--text)' }}>
                    {s.name} <span className="opacity-40 text-[10px]">{s.url}</span>
                  </button>
                  <ServerMenuButton onEdit={() => startEdit(s)} onDelete={() => remove(s.id)} onManage={() => manageServer(s)} />
                </>
              )}
            </div>
          ))}
          <div className="border-t mt-1 pt-1" style={{ borderColor: 'var(--border)' }}>
            {adding ? (
              <div className="space-y-1">
                <input value={newName} onChange={e => setNewName(e.target.value)} placeholder="名称" className="glass-input text-xs" autoFocus />
                <input value={newUrl} onChange={e => setNewUrl(e.target.value)} placeholder="服务器 IP 或域名" className="glass-input text-xs" />
                <div className="flex gap-1">
                  <button onClick={add} className="glass-btn primary text-[10px] px-2 py-0.5">添加</button>
                  <button onClick={() => setAdding(false)} className="glass-btn text-[10px] px-2 py-0.5">取消</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setAdding(true)} className="w-full text-left text-xs px-2 py-1.5 rounded-lg opacity-50 hover:opacity-100">＋ 添加服务器</button>
            )}
          </div>

        </div>
      )}
    </div>
  );
}

function ServerMenuButton({ onEdit, onDelete, onManage }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button onClick={e => { e.stopPropagation(); setOpen(!open); }} className="glass-btn text-[10px] px-1 py-0.5" title="更多">···</button>
      {open && (
        <div className="absolute right-0 top-full mt-0.5 w-28 popup-solid p-1 z-[1000] shadow-lg" onClick={() => setOpen(false)}>
          <button onClick={onEdit} className="w-full text-left text-[11px] px-2 py-1 rounded-lg hover:opacity-80" style={{ color: 'var(--text)' }}>✏ 编辑</button>
          <button onClick={onManage} className="w-full text-left text-[11px] px-2 py-1 rounded-lg hover:opacity-80" style={{ color: 'var(--text)' }}>👥 管理</button>
          <button onClick={onDelete} className="w-full text-left text-[11px] px-2 py-1 rounded-lg hover:opacity-80" style={{ color: '#FF3B30' }}>🗑 删除</button>
        </div>
      )}
    </div>
  );
}
