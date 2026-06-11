import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';

export default function ChatPanel() {
  const { showChat, setShowChat, user, addToast } = useStore();
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  if (!showChat) return null;
  const { projectId, projectName } = showChat;

  const load = async () => {
    try { setMsgs(await window.vibehub.getMessages(projectId)); } catch { }
  };

  useEffect(() => { load(); const i = setInterval(load, 10000); return () => clearInterval(i); }, [projectId]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [msgs]);

  const send = async () => {
    if (!text.trim() || !user) return;
    setLoading(true);
    try {
      await window.vibehub.sendMessage(projectId, text.trim());
      setText('');
      await load();
    } catch (e) { addToast({ type: 'error', message: e.message }); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center dialog-overlay" onClick={() => setShowChat(null)}>
      <div className="popup-solid p-4 w-96 h-96 flex flex-col shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">💬 {projectName}</h3>
          <button onClick={() => setShowChat(null)} className="text-xs opacity-50 hover:opacity-100">✕</button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-2 mb-3 text-xs">
          {msgs.length === 0 && <p className="text-center opacity-40 py-4">暂无消息，开始聊天吧</p>}
          {msgs.map(m => (
            <div key={m.id} className="flex flex-col">
              <div className="flex items-center gap-2">
                <span className="font-medium">{m.username}</span>
                <span className="text-[10px] opacity-40">{new Date(m.created_at * 1000).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <p className="ml-1 opacity-80">{m.content}</p>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>

        {user ? (
          <div className="flex gap-1.5">
            <input value={text} onChange={e => setText(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
              placeholder="输入消息..." className="glass-input text-xs flex-1" disabled={loading} />
            <button onClick={send} disabled={loading || !text.trim()} className="glass-btn primary text-xs px-3">发送</button>
          </div>
        ) : (
          <p className="text-xs text-center opacity-40">请先登录以发送消息</p>
        )}
      </div>
    </div>
  );
}
