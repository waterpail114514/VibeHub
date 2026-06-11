import React, { useState, useEffect } from 'react';
import { useStore } from '../store';

export default function ServerManageDialog() {
  const { showManage, setShowManage, addToast } = useStore();
  const [admins, setAdmins] = useState([]);
  const [requests, setRequests] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [addName, setAddName] = useState('');
  const [tab, setTab] = useState('admins');

  if (!showManage) return null;
  const { serverName } = showManage;

  const load = async () => {
    try {
      const status = await window.vibehub.adminStatus();
      setAdmins(status.admins || []);
      setIsAdmin(status.isAdmin);
      if (status.isAdmin) {
        const reqs = await window.vibehub.getPushRequests();
        setRequests(reqs || []);
      }
    } catch (e) { addToast({ type: 'error', message: e.message }); }
  };

  useEffect(() => { load(); }, []);

  const doAddAdmin = async () => {
    if (!addName.trim()) return;
    try { await window.vibehub.addAdmin(addName.trim()); setAddName(''); load(); addToast({ type: 'success', message: '管理员已添加' }); }
    catch (e) { addToast({ type: 'error', message: e.message }); }
  };

  const doRemoveAdmin = async (userId) => {
    try { await window.vibehub.removeAdmin(userId); load(); addToast({ type: 'success', message: '已移除' }); }
    catch (e) { addToast({ type: 'error', message: e.message }); }
  };

  const doReview = async (requestId, approved) => {
    try { await window.vibehub.reviewPush(requestId, approved); load(); addToast({ type: 'success', message: approved ? '已批准' : '已拒绝' }); }
    catch (e) { addToast({ type: 'error', message: e.message }); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center dialog-overlay" onClick={() => setShowManage(null)}>
      <div className="popup-solid p-5 w-96 max-h-[75vh] overflow-y-auto shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1">👥 {serverName} 管理</h3>

        {/* Tabs */}
        <div className="flex gap-1 mb-3">
          <button onClick={() => setTab('admins')} className="text-xs px-3 py-1 rounded-full"
            style={{ background: tab === 'admins' ? 'rgba(0,122,255,0.1)' : 'var(--btn-bg)', color: tab === 'admins' ? '#007AFF' : 'var(--muted)' }}>管理员 ({admins.length})</button>
          {isAdmin && (
            <button onClick={() => setTab('requests')} className="text-xs px-3 py-1 rounded-full relative"
              style={{ background: tab === 'requests' ? 'rgba(0,122,255,0.1)' : 'var(--btn-bg)', color: tab === 'requests' ? '#007AFF' : 'var(--muted)' }}>
              推送申请 ({requests.length})
              {requests.length > 0 && <span className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full" />}
            </button>
          )}
        </div>

        {tab === 'admins' && (
          <div>
            {admins.map(a => (
              <div key={a.user_id} className="flex items-center justify-between text-xs py-2 px-2 rounded-lg mb-0.5" style={{ background: 'var(--btn-bg)' }}>
                <div>
                  <span className="font-medium">{a.username}</span>
                  <span className="text-[10px] ml-2 opacity-40">由 {a.added_by} 添加</span>
                </div>
                {isAdmin && a.added_by !== 'system' && (
                  <button onClick={() => doRemoveAdmin(a.user_id)} className="text-[10px] px-2 py-0.5 rounded hover:opacity-80" style={{ color: '#FF3B30' }}>移除</button>
                )}
              </div>
            ))}
            {isAdmin && (
              <div className="flex gap-1.5 mt-2">
                <input value={addName} onChange={e => setAddName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && doAddAdmin()}
                  placeholder="输入用户名添加管理员" className="glass-input text-xs flex-1" />
                <button onClick={doAddAdmin} className="glass-btn primary text-xs px-3">添加</button>
              </div>
            )}
            {!isAdmin && <p className="text-xs opacity-40 text-center py-4">你不是管理员，无法修改管理员列表</p>}
          </div>
        )}

        {tab === 'requests' && (
          <div>
            {requests.length === 0 && <p className="text-xs opacity-40 text-center py-4">暂无待审批的推送申请</p>}
            {requests.map(r => (
              <div key={r.id} className="p-2 rounded-lg mb-1.5" style={{ background: 'var(--btn-bg)' }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium">{r.username}</span>
                  <span className="text-[10px] opacity-40">{new Date(r.created_at * 1000).toLocaleString('zh-CN')}</span>
                </div>
                <p className="text-[11px] opacity-70 mb-1">{r.summary || `${r.file_count} 个文件`}</p>
                <div className="flex gap-1.5">
                  <button onClick={() => doReview(r.id, true)} className="glass-btn text-[10px] px-2 py-0.5" style={{ color: '#34C759' }}>✓ 批准</button>
                  <button onClick={() => doReview(r.id, false)} className="glass-btn text-[10px] px-2 py-0.5" style={{ color: '#FF3B30' }}>✕ 拒绝</button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex justify-end mt-4">
          <button onClick={() => setShowManage(null)} className="glass-btn primary text-xs">关闭</button>
        </div>
      </div>
    </div>
  );
}
