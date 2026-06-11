import React, { useState, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { fmtSize } from '../utils';

function timeAgo(ts) {
  if (!ts) return '';
  const d = Math.floor(Date.now() / 1000) - ts;
  if (d < 60) return '刚刚';
  if (d < 3600) return `${Math.floor(d / 60)}分前`;
  if (d < 86400) return `${Math.floor(d / 3600)}时前`;
  return `${Math.floor(d / 86400)}天前`;
}

export default function ProjectCard({ project, onRefresh }) {
  const { localStates, setLocalState, addToast, user, setShowHistory, setShowAi, setShowUpload, setShowChat, setShowChangelog } = useStore();
  const ls = localStates[project.id] || {};
  const [syncing, setSyncing] = useState(false);
  const [act, setAct] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [lock, setLock] = useState(null);
  const [hasClaude, setHasClaude] = useState(false);
  const [projIcon, setProjIcon] = useState(null);
  const menuProjectId = useStore(s => s.openMenuProjectId);

  const hasLocal = !!ls.localPath;
  const hasChanges = ls.hasChanges || false;
  const fileCount = ls.fileCount ?? project.file_count;
  const totalSize = ls.totalSize ?? project.total_size ?? 0;
  const serverUpdated = project.updated_at > (ls.lastSyncAt || 0);
  const deleteReq = project.deleteRequest;

  useEffect(() => {
    if (serverUpdated && window.vibehub) window.vibehub.checkLock(project.id).then(l => setLock(l)).catch(() => {});
    if (hasLocal && window.vibehub) {
      window.vibehub.hasClaude().then(b => setHasClaude(b)).catch(() => {});
      window.vibehub.getProjectIcon(project.id).then(icon => setProjIcon(icon)).catch(() => {});
    }
  }, [serverUpdated, project.id, hasLocal]);

  let status = 'new';
  if (hasLocal && !hasChanges && !serverUpdated) status = 'ok';
  else if (hasLocal && hasChanges && serverUpdated) status = 'conflict';
  else if (hasLocal && hasChanges) status = 'changed';
  else if (hasLocal && serverUpdated) status = 'updated';
  else if (hasLocal) status = 'ok';

  const doPull = async () => {
    if (syncing) return;
    if (window.vibehub) { const l = await window.vibehub.checkLock(project.id); if (l.locked) { addToast({ type: 'warning', message: `${l.holder} 正在${l.operation}` }); return; } }
    if (!hasLocal) await window.vibehub.setProjectPath(project.id, project.name);
    try {
      const diff = await window.vibehub.getPullPreview(project.id);
      const total = (diff.toDownload?.length || 0) + (diff.toDeleteLocally?.length || 0);
      if (total === 0) { addToast({ type: 'info', message: `"${project.name}" 已是最新` }); return; }
      useStore.getState().setShowConfirmPull({
        projectId: project.id, projectName: project.name, diff,
        onDone: async () => {
          setSyncing(true); setAct('pull');
          try {
            const r = await window.vibehub.pullProject(project.id);
            const d = r.downloaded?.length || 0, del = r.deleted?.length || 0;
            addToast({ type: 'success', message: `同步: ${d}下载 ${del}清理` });
            const info = await window.vibehub.getProjectInfo(project.id);
            const scan = await window.vibehub.scanLocal(project.id);
            setLocalState(project.id, { localPath: info?.localPath, lastSyncAt: info?.lastSyncAt, hasChanges: false, fileCount: scan.fileCount, totalSize: scan.totalSize, added: [], changed: [], deleted: [] });
            setLock(null); onRefresh();
          } catch (e) { addToast({ type: 'error', message: e.message }); }
          finally { setSyncing(false); setAct(null); }
        }
      });
    } catch (e) { addToast({ type: 'error', message: e.message }); }
  };

  const doPush = async () => {
    if (syncing) return;
    if (window.vibehub) {
      const l = await window.vibehub.checkLock(project.id);
      if (l.locked) { addToast({ type: 'warning', message: `${l.holder} 正在${l.operation}` }); return; }
      try {
        const perm = await window.vibehub.checkPushPermission(project.id);
        if (!perm.ok) {
          addToast({ type: 'warning', message: perm.reason || '没有上传权限' });
          if (perm.needApproval && confirm('你没有上传权限。是否提交推送申请？')) {
            try {
              const diff = await window.vibehub.getDiff(project.id);
              const total = (diff.added?.length || 0) + (diff.changed?.length || 0) + (diff.deleted?.length || 0);
              const r = await window.vibehub.requestPush(project.id, total + ' 个文件', total);
              addToast({ type: 'info', message: r.message || '已提交申请' });
            } catch (e) { addToast({ type: 'error', message: e.message }); }
          }
          return;
        }
      } catch (e) { /* proceed */ }
    }
    // Show scanning state immediately, then compute diff
    setSyncing(true); setAct('scan');
    await new Promise(r => setTimeout(r, 50)); // let UI paint
    try {
      const diff = await window.vibehub.getDiff(project.id);
      if (!diff.added?.length && !diff.changed?.length && !diff.deleted?.length) {
        addToast({ type: 'info', message: '没有需要上传的更改' }); return;
      }
      setShowUpload({ projectId: project.id, projectName: project.name, diff });
    } catch (e) { addToast({ type: 'error', message: e.message }); }
    finally { setSyncing(false); setAct(null); }
  };

  const doOpen = async () => { try { await window.vibehub.openProjectFolder(project.id); } catch { } };

  const doHistory = async () => {
    try { const data = await window.vibehub.getHistory(project.id); setShowHistory({ projectName: project.name, history: data.history }); }
    catch (e) { addToast({ type: 'error', message: e.message }); }
  };

  const doAi = async (mode) => {
    setAiLoading(true);
    try {
      const result = await window.vibehub.aiExplain(project.id, mode);
      setShowAi({ projectName: project.name, explanation: result.explanation });
    } catch (e) { addToast({ type: 'error', message: e.message }); }
    finally { setAiLoading(false); }
  };

  const doChat = () => setShowChat({ projectId: project.id, projectName: project.name });
  const doChangelog = () => setShowChangelog({ projectId: project.id, projectName: project.name });

  const doLaunchClaude = async () => {
    try { await window.vibehub.launchClaude(project.id); addToast({ type: 'info', message: 'Claude Code 已启动' }); }
    catch (e) { addToast({ type: 'error', message: '未找到 Claude CLI' }); }
  };

  const doDelete = async () => {
    if (!user) { addToast({ type: 'warning', message: '请先登录' }); return; }
    if (!confirm(`请求删除项目"${project.name}"？需要所有贡献者同意。`)) return;
    try { const r = await window.vibehub.requestDelete(project.id); addToast({ type: r.deleted ? 'success' : 'info', message: r.message || (r.deleted ? '已删除' : '已提交') }); onRefresh(); }
    catch (e) { addToast({ type: 'error', message: e.message }); }
  };

  const doCancelDelete = async () => {
    try { await window.vibehub.cancelDelete(project.id); addToast({ type: 'info', message: '已取消' }); onRefresh(); }
    catch (e) { addToast({ type: 'error', message: e.message }); }
  };

  const ch = [];
  if (ls.added?.length) ch.push(`+${ls.added.length}`);
  if (ls.changed?.length) ch.push(`~${ls.changed.length}`);
  if (ls.deleted?.length) ch.push(`-${ls.deleted.length}`);

  const aiMode = hasChanges ? 'changes' : serverUpdated ? 'changes' : 'overview';
  const aiLabel = hasChanges ? '分析我的更改' : serverUpdated ? '分析更新' : '分析项目';

  return (
    <div className="glass-card p-2.5 animate-slide-up relative" style={{ zIndex: menuProjectId === project.id ? 9999 : 'auto' }}>
      {lock?.locked && <div className="text-[10px] mb-2 px-2 py-1 rounded-lg" style={{ background: 'rgba(255,149,0,0.08)', color: '#FF9500' }}>⚠ {lock.holder} 正在{lock.operation}，暂勿操作</div>}
      {deleteReq?.status === 'pending' && <div className="text-[10px] mb-2 px-2 py-1 rounded-lg flex items-center justify-between" style={{ background: 'rgba(255,59,48,0.08)', color: '#FF3B30' }}><span>🗑 删除待审批 ({deleteReq.approvers?.length}/{deleteReq.allContributors?.length})</span><button onClick={doCancelDelete} className="underline text-[10px]">取消</button></div>}
      {syncing && <div className="text-[10px] mb-2 px-2 py-1 rounded-lg flex items-center gap-2" style={{ background: 'rgba(0,122,255,0.08)', color: '#007AFF' }}><span className="w-3 h-3 border border-current border-t-transparent rounded-full animate-spin" />{act === 'scan' ? '正在扫描文件变更...' : act === 'push' ? '上传中...' : '同步中...'}</div>}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          {projIcon ? <img src={projIcon} className="w-7 h-7 rounded-lg shrink-0" /> : <span className="text-xl shrink-0">{icon(project.name)}</span>}
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-[13px] font-semibold truncate">{project.name}</span>
              <StatusBadge status={status} />
            </div>
            <div className="flex items-center gap-2 mt-0.5 text-[10px] whitespace-nowrap overflow-hidden" style={{ color: 'var(--muted)' }}>
              <span>{fileCount} 文件</span>
              {totalSize > 0 && <span>{fmtSize(totalSize)}</span>}
              {ls.lastSyncAt && <span>{timeAgo(ls.lastSyncAt)}</span>}
              {ch.length > 0 && <span style={{ color: '#FF9500' }}>{ch.join(' ')}</span>}
              {!hasLocal && <span style={{ color: '#007AFF' }}>待同步</span>}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-0.5 shrink-0 ml-1">
          <button onClick={doPull} disabled={syncing || lock?.locked} className="glass-btn text-[10px] px-2 py-1 relative" title="同步">
            {syncing && act === 'pull' ? '⏳' : '↓ 同步'}
            {serverUpdated && !syncing && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-white" />}
          </button>
          {hasLocal && (
            <button onClick={doPush} disabled={syncing || !hasChanges} className="glass-btn primary text-[10px] px-2 py-1 relative" title="上传">
              {syncing && act === 'push' ? '⏳' : '↑ 上传'}
              {hasChanges && !syncing && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-red-500 rounded-full border border-white" />}
            </button>
          )}
          <button onClick={() => doAi(aiMode)} disabled={aiLoading} className="glass-btn text-[10px] px-2 py-1" title={aiLabel} style={{ color: '#007AFF' }}>{aiLoading ? '⏳' : '🤖 AI'}</button>
          {hasLocal && <OverflowMenu projectId={project.id} onOpen={doOpen} onHistory={doHistory} onChat={doChat} onChangelog={doChangelog} onClaude={doLaunchClaude} hasClaude={hasClaude} onDelete={doDelete} />}
        </div>
      </div>

      {hasChanges && (ls.added?.length + ls.changed?.length + ls.deleted?.length > 0) && (
        <div className="mt-2 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="text-[10px] font-mono space-y-0.5 max-h-20 overflow-y-auto">
            {ls.added?.slice(0, 3).map(f => <div key={f} style={{ color: '#34C759' }}>+ {f}</div>)}
            {ls.changed?.slice(0, 3).map(f => <div key={f} style={{ color: '#FF9500' }}>~ {f}</div>)}
            {ls.deleted?.slice(0, 3).map(f => <div key={f} style={{ color: '#FF3B30' }}>- {f}</div>)}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }) {
  const map = { 'ok': { l: '已同步', c: '#34C759', b: 'rgba(52,199,89,0.12)' }, 'changed': { l: '有更改', c: '#FF9500', b: 'rgba(255,149,0,0.12)' }, 'updated': { l: '有更新', c: '#007AFF', b: 'rgba(0,122,255,0.10)' }, 'conflict': { l: '需同步', c: '#FF3B30', b: 'rgba(255,59,48,0.10)' }, 'new': { l: '未同步', c: '#86868b', b: 'rgba(0,0,0,0.06)' } };
  const s = map[status] || map.new;
  return <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full whitespace-nowrap shrink-0" style={{ color: s.c, background: s.b }}>{s.l}</span>;
}

function OverflowMenu({ projectId, onOpen, onHistory, onChat, onChangelog, onClaude, hasClaude, onDelete }) {
  const menuId = useRef(Math.random().toString(36)).current;
  const openMenuId = useStore(s => s.openMenuId);
  const timer = useRef(null);
  const openMenu = () => {
    clearTimeout(timer.current);
    const { setOpenMenuId, setOpenMenuProjectId } = useStore.getState();
    setOpenMenuId(menuId); setOpenMenuProjectId(projectId);
  };
  const closeMenu = () => {
    timer.current = setTimeout(() => {
      const { setOpenMenuId, setOpenMenuProjectId } = useStore.getState();
      setOpenMenuId(null); setOpenMenuProjectId(null);
    }, 200);
  };
  const open = openMenuId === menuId;
  return (
    <div className="relative" onMouseEnter={openMenu} onMouseLeave={closeMenu}>
      <button className="glass-btn text-[10px] px-1.5 py-1" title="更多">···</button>
      {open && (
        <div className="absolute right-0 top-full mt-1 w-36 popup-solid p-1.5 shadow-xl animate-slide-up" style={{ zIndex: 99999 }} onMouseEnter={openMenu} onMouseLeave={closeMenu}>
          <MenuItem onClick={onOpen} label="📂 打开文件夹" />
          <MenuItem onClick={onHistory} label="📋 编辑历史" />
          <MenuItem onClick={onChat} label="💬 项目聊天" />
          <MenuItem onClick={onChangelog} label="📝 更新日志" />
          {hasClaude && <MenuItem onClick={onClaude} label="🧠 Claude Code" />}
          <div className="border-t my-0.5" style={{ borderColor: 'var(--border)' }} />
          <MenuItem onClick={onDelete} label="🗑 删除项目" danger />
        </div>
      )}
    </div>
  );
}

function MenuItem({ onClick, label, danger }) {
  return (
    <button onClick={onClick} className="w-full text-left text-xs px-2 py-1 rounded-lg hover:opacity-80"
      style={{ color: danger ? '#FF3B30' : 'var(--text)' }}>
      {label}
    </button>
  );
}

function icon(name) {
  const m = { 'app':'📱','web':'🌐','api':'🔌','bot':'🤖','game':'🎮','tool':'🔧','ai':'🧠','chat':'💬','vibe':'🔮','weird':'🌀','art':'🎨','my':'💜','awesome':'🌟','super':'💪','ultra':'⚡' };
  for (const [k, v] of Object.entries(m)) if (name.toLowerCase().includes(k)) return v;
  return '🚀';
}
