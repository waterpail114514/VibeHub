import React, { useEffect, useCallback, useState } from 'react';
import { useStore } from './store';
import ProjectList from './components/ProjectList';
import CreateDialog from './components/CreateDialog';
import SettingsDialog from './components/SettingsDialog';
import HelpDialog from './components/HelpDialog';
import LoginDialog from './components/LoginDialog';
import HistoryDialog from './components/HistoryDialog';
import AiExplainDialog from './components/AiExplainDialog';
import UploadConfirmDialog from './components/UploadConfirmDialog';
import ChatPanel from './components/ChatPanel';
import ChangelogPanel from './components/ChangelogPanel';
import ServerSwitcher from './components/ServerSwitcher';
import ServerManageDialog from './components/ServerManageDialog';
import SyncConfirmDialog from './components/SyncConfirmDialog';
import Toast from './components/Toast';
import appIcon from './assets/icon-32.png';

export default function App() {
  const { showSettings, showCreate, showHelp, showLogin, showHistory, showAi, showUpload, showConfirmPull, showChat, showChangelog, showManage, darkMode,
    setServerOnline, setProjects, setProjectsLoading, setServerUrl, setUser, setDarkMode } = useStore();
  const [pinned, setPinned] = useState(false);

  useEffect(() => {
    if (!window.vibehub) return;
    window.vibehub.getConfig().then(c => {
      setServerUrl(c.serverUrl || 'http://localhost:3456');
      if (c.darkMode !== undefined) setDarkMode(c.darkMode);
    });
    window.vibehub.getWindowState().then(s => setPinned(s.pinned));
    window.vibehub.getToken().then(u => { if (u) setUser(u); });
  }, []);

  useEffect(() => {
    document.documentElement.className = darkMode ? 'dark' : '';
  }, [darkMode]);

  const refresh = useCallback(async (showLoading) => {
    if (!window.vibehub) return;
    if (showLoading) setProjectsLoading(true);
    try {
      const online = await window.vibehub.checkServer();
      setServerOnline(online);
      if (!online) return;
      const projects = await window.vibehub.listProjects();
      const enriched = await Promise.all(projects.map(async p => {
        const info = await window.vibehub.getProjectInfo(p.id);
        return { ...p, localInfo: info };
      }));
      setProjects(enriched);
      // Fast path: set local info from config (no file scan)
      for (const p of enriched) {
        if (p.localInfo) {
          const existing = useStore.getState().localStates[p.id] || {};
          useStore.getState().setLocalState(p.id, { ...existing, localPath: p.localInfo.localPath, lastSyncAt: p.localInfo.lastSyncAt });
        }
      }
      // Only scan files on first load
      if (showLoading) {
        for (const p of enriched) {
          if (p.localInfo) {
            try {
              const scan = await window.vibehub.scanLocal(p.id);
              useStore.getState().setLocalState(p.id, { ...useStore.getState().localStates[p.id], hasChanges: scan.hasChanges, fileCount: scan.fileCount, totalSize: scan.totalSize, added: scan.added || [], changed: scan.changed || [], deleted: scan.deleted || [] });
            } catch { }
          }
        }
      }
    } catch (e) { console.error(e); }
    finally { setProjectsLoading(false); }
  }, []);

  useEffect(() => { refresh(true); }, []);

  const fullRefresh = useCallback(() => refresh(true), []);
  const handlePin = async () => { const np = await window.vibehub.togglePin(); setPinned(np); };
  const { localStates } = useStore();

  return (
    <div className="h-full flex flex-col glass overflow-hidden select-none" style={{ borderRadius: 8, color: 'var(--text)' }}>
      <TitleBar pinned={pinned} onPin={handlePin} onRefresh={fullRefresh} />

      <main className="flex-1 px-4 py-3" style={{ overflow: 'visible' }}>
        <div className="h-full overflow-y-auto">
          <ProjectList onRefresh={fullRefresh} />
        </div>
      </main>

      <FooterBar />

      {showCreate && <CreateDialog onCreated={fullRefresh} />}
      {showSettings && <SettingsDialog onSave={fullRefresh} />}
      {showHelp && <HelpDialog />}
      {showLogin && <LoginDialog onDone={fullRefresh} />}
      {showHistory && <HistoryDialog />}
      {showAi && <AiExplainDialog />}
      {showUpload && <UploadConfirmDialog onConfirm={async (files) => {
        const pid = showUpload.projectId;
        const r = await window.vibehub.pushProject(pid, files);
        useStore.getState().addToast({ type: 'success', message: `上传: ${r.uploaded?.length || 0}个文件` });
        fullRefresh();
      }} />}
      {showConfirmPull && <SyncConfirmDialog />}
      {showChat && <ChatPanel />}
      {showChangelog && <ChangelogPanel />}
      {showManage && <ServerManageDialog />}
      <Toast />
    </div>
  );
}

function TitleBar({ pinned, onPin, onRefresh }) {
  const { user, setShowLogin, darkMode, setDarkMode } = useStore();
  const min = () => window.vibehub?.minimize();
  const max = () => window.vibehub?.maximize();
  const close = () => window.vibehub?.close();
  const btn = "titlebar-btn w-8 h-7 flex items-center justify-center text-xs transition-colors hover:bg-black/5 active:bg-black/10";

  return (
    <header className="titlebar flex items-center justify-between shrink-0" style={{ height: 36, background: 'var(--header-bg)' }}>
      <div className="flex items-center gap-1.5 pl-3">
        <img src={appIcon} alt="" className="w-[18px] h-[18px] rounded-full" />
        <ServerSwitcher />
        <div className="flex items-center gap-0.5">
          <button onClick={onPin} className="titlebar-btn text-[11px] px-1.5 py-1 rounded transition-all" style={{ background: pinned ? 'rgba(52,199,89,0.12)' : 'var(--btn-bg)', color: pinned ? '#1B8731' : 'var(--muted)' }}>{pinned ? '📌' : '📍'}</button>
          {!user && <button onClick={() => setShowLogin(true)} className="titlebar-btn text-[11px] px-1.5 py-1 rounded opacity-55 hover:opacity-100" style={{ background: 'var(--btn-bg)' }}>👤</button>}
          <button onClick={() => setDarkMode(!darkMode)} className="titlebar-btn text-[11px] px-1.5 py-1 rounded opacity-55 hover:opacity-100" style={{ background: 'var(--btn-bg)' }}>{darkMode ? '☀' : '🌙'}</button>
          <button onClick={onRefresh} className="titlebar-btn text-[11px] px-1.5 py-1 rounded opacity-55 hover:opacity-100" style={{ background: 'var(--btn-bg)' }}>↻</button>
          <button onClick={() => useStore.getState().setShowCreate(true)} className="titlebar-btn text-[11px] px-1.5 py-1 rounded opacity-55 hover:opacity-100" style={{ background: 'var(--btn-bg)' }}>＋</button>
          <button onClick={() => useStore.getState().setShowSettings(true)} className="titlebar-btn text-[11px] px-1.5 py-1 rounded opacity-55 hover:opacity-100" style={{ background: 'var(--btn-bg)' }}>⚙</button>
          <button onClick={() => useStore.getState().setShowHelp(true)} className="titlebar-btn text-[11px] px-1.5 py-1 rounded font-semibold" style={{ background: 'rgba(0,122,255,0.08)', color: '#007AFF' }}>?</button>
        </div>
      </div>
      <div className="flex h-full">
        <button onClick={min} className={btn}><svg width="10" height="10" viewBox="0 0 10 10"><rect y="4.5" width="10" height="1" fill="currentColor" opacity="0.6"/></svg></button>
        <button onClick={max} className={btn}><svg width="10" height="10" viewBox="0 0 10 10"><rect x="0.5" y="0.5" width="9" height="9" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6"/></svg></button>
        <button onClick={close} className={`${btn} hover:bg-red-500 hover:text-white`}><svg width="10" height="10" viewBox="0 0 10 10"><line x1="1" y1="1" x2="9" y2="9" stroke="currentColor" strokeWidth="1.2" opacity="0.6"/><line x1="9" y1="1" x2="1" y2="9" stroke="currentColor" strokeWidth="1.2" opacity="0.6"/></svg></button>
      </div>
    </header>
  );
}

function FooterBar() {
  const user = useStore(s => s.user);
  const localStates = useStore(s => s.localStates);
  const online = useStore(s => s.serverOnline);
  return (
    <footer className="h-7 flex items-center justify-between px-4 text-[11px] shrink-0" style={{ background: 'var(--footer-bg)', color: 'var(--muted)' }}>
      <div className="flex items-center gap-1.5">
        <div className="w-1.5 h-1.5 rounded-full" style={{ background: online ? '#34C759' : '#FF3B30' }} />
        <span>{online ? '在线' : '离线'}</span>
      </div>
      <div className="flex items-center gap-2">
        {user ? <span>{user.username}</span> : <button onClick={() => useStore.getState().setShowLogin(true)} className="hover:underline">登录</button>}
        <span>{Object.keys(localStates).length} 项目</span>
      </div>
    </footer>
  );
}
