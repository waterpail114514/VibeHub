import React, { useState } from 'react';
import { useStore } from '../store';

export default function LoginDialog({ onDone }) {
  const [isLogin, setIsLogin] = useState(true);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const { setShowLogin, setUser, addToast } = useStore();

  const handle = async () => {
    if (!username.trim() || !password) { setError('请填写用户名和密码'); return; }
    setLoading(true); setError('');
    try {
      const user = isLogin
        ? await window.vibehub.login(username.trim(), password)
        : await window.vibehub.register(username.trim(), password);
      setUser(user);
      setShowLogin(false);
      addToast({ type: 'success', message: `${isLogin ? '登录' : '注册'}成功，你好 ${user.username}` });
      if (onDone) onDone();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center dialog-overlay" onClick={() => setShowLogin(false)}>
      <div className="popup-solid p-5 w-72 shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1">{isLogin ? '登录' : '注册'}</h3>
        <p className="text-xs text-surface-muted mb-3">
          {isLogin ? '登录以记录你的编辑历史' : '注册一个新账号'}
        </p>
        <input value={username} onChange={e => { setUsername(e.target.value); setError(''); }}
          placeholder="用户名" className="glass-input mb-2" autoFocus disabled={loading}
          onKeyDown={e => e.key === 'Enter' && handle()} />
        <input value={password} onChange={e => { setPassword(e.target.value); setError(''); }}
          type="password" placeholder="密码" className="glass-input mb-2" disabled={loading}
          onKeyDown={e => e.key === 'Enter' && handle()} />
        {error && <p className="text-xs mb-2" style={{ color: '#FF3B30' }}>{error}</p>}
        <div className="flex justify-between items-center mt-3">
          <button onClick={() => { setIsLogin(!isLogin); setError(''); }}
            className="text-xs opacity-60 hover:opacity-100">{isLogin ? '没有账号？注册' : '已有账号？登录'}</button>
          <div className="flex gap-2">
            <button onClick={() => setShowLogin(false)} className="glass-btn text-xs">取消</button>
            <button onClick={handle} className="glass-btn primary text-xs" disabled={loading}>
              {loading ? '...' : isLogin ? '登录' : '注册'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
