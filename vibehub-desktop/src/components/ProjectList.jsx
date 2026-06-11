import React from 'react';
import { useStore } from '../store';
import ProjectCard from './ProjectCard';

export default function ProjectList({ onRefresh }) {
  const { projects, projectsLoading, serverOnline } = useStore();

  if (!window.vibehub) {
    return <EmptyState icon="🔮" title="VibeHub Desktop" desc="请在 Electron 中运行" />;
  }

  if (!serverOnline) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
        <span className="text-5xl">☁️</span>
        <p className="text-sm font-medium" style={{ color: '#FF3B30' }}>未连接服务器</p>
        <p className="text-xs text-surface-muted px-4">请确保服务器已启动并在设置中配置地址</p>
        <div className="flex gap-2 mt-1">
          <button onClick={() => useStore.getState().setShowSettings(true)} className="glass-btn primary text-xs">打开设置</button>
          <button onClick={onRefresh} className="glass-btn text-xs">重试</button>
        </div>
      </div>
    );
  }

  if (projectsLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <div className="w-5 h-5 border-2 border-surface-accent border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-surface-muted">加载中...</p>
      </div>
    );
  }

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
        <span className="text-5xl">✨</span>
        <p className="text-sm font-medium">还没有项目</p>
        <p className="text-xs text-surface-muted px-4">创建你的第一个 Vibe 项目</p>
        <button onClick={() => useStore.getState().setShowCreate(true)} className="glass-btn primary text-xs mt-1">
          + 创建项目
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-surface-muted uppercase tracking-wider px-1">
        项目 ({projects.length})
      </p>
      {projects.map(p => (
        <ProjectCard key={p.id} project={p} onRefresh={onRefresh} />
      ))}
    </div>
  );
}

function EmptyState({ icon, title, desc }) {
  return (
    <div className="flex flex-col items-center justify-center h-full gap-2 text-center">
      <span className="text-5xl">{icon}</span>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-surface-muted">{desc}</p>
    </div>
  );
}
