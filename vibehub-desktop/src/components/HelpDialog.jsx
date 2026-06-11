import React from 'react';
import { useStore } from '../store';

export default function HelpDialog() {
  const setShowHelp = () => useStore.getState().setShowHelp(false);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center dialog-overlay" onClick={setShowHelp}>
      <div className="glass-card p-5 w-80 max-h-[70vh] overflow-y-auto shadow-2xl animate-slide-up" onClick={e => e.stopPropagation()}>
        <h3 className="text-base font-semibold mb-1">📖 使用说明</h3>
        <p className="text-[11px] opacity-50 mb-3">和朋友一起 Vibecoding 的协作工具</p>

        <div className="space-y-3 text-xs">
          <Step num="1" title="配置服务器"
            desc="点击标题栏服务器名 → 添加服务器 → 输入 IP 和端口。每个服务器独立管理，鼠标悬浮即可切换。" />
          <Step num="2" title="登录 / 注册"
            desc="点击 👤 登录。第一个注册的用户自动成为服务器管理员，可以管理其他管理员和审批推送申请。" />
          <Step num="3" title="创建项目"
            desc="点击 ＋ 新建项目 → 输入名称 → 自动在本地同步文件夹创建目录。" />
          <Step num="4" title="同步到本地"
            desc="新项目先点 ↓ 同步 → 下载服务器上所有文件。后续 ↓ 只下载变化部分，并清理本地多余文件。红点表示有更新。" />
          <Step num="5" title="Vibecoding"
            desc="点 ··· → 打开文件夹 → 用 VS Code / Cursor 编辑。如果装了 Claude Code 会出现 🧠 按钮一键呼起。" />
          <Step num="6" title="上传更改"
            desc="点 ↑ 上传 → 弹出确认清单 → 勾选要上传的文件 → 点文件旁的预览查看变更 → 确认上传。红点表示有本地更改。非管理员需管理员审批。" />
          <Step num="7" title="AI 分析"
            desc="点 🤖 AI → 自动根据当前状态分析：有更新时解读更新内容、有更改时审查你的代码、已同步时分析项目整体结构。支持 Markdown 和 LaTeX 渲染。" />
          <Step num="8" title="协作功能"
            desc="💬 聊天 → 项目内留言讨论。📋 编辑历史 → 查看谁在什么时候改了什么。📝 更新日志 → 手写或用 AI 生成 changelog。" />
          <Step num="9" title="多服务器管理"
            desc="服务器名右侧 ··· → 编辑 / 管理 / 删除。管理员可添加其他管理员，审批非管理员的推送申请。" />
          <Step num="10" title="暗色主题"
            desc="标题栏 🌙 → 切换暗色模式，磨砂玻璃效果保留。" />
        </div>

        <div className="mt-4 pt-3 border-t border-surface-border space-y-1.5 text-[10px] opacity-50">
          <TipRow keys="Ctrl+Shift+V" desc="全局显示/隐藏窗口" />
          <TipRow keys="📌 置顶" desc="窗口始终在最前" />
          <TipRow keys="📂 ··· 菜单" desc="更多操作：打开、历史、聊天、日志、Claude Code、删除" />
          <TipRow keys=".vibeignore" desc="项目根目录创建此文件忽略同步 node_modules 等" />
          <TipRow keys="左上角服务器名" desc="悬浮切换服务器，移开关闭" />
        </div>

        <div className="mt-3 text-[10px] opacity-30">
          同步目录：文档\VibeHubProjects\ · 配置目录：~\.vibehub\
        </div>

        <div className="flex justify-end mt-4">
          <button onClick={setShowHelp} className="glass-btn primary text-xs">知道了</button>
        </div>
      </div>
    </div>
  );
}

function Step({ num, title, desc }) {
  return (
    <div className="flex gap-2">
      <div className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold shrink-0 mt-0.5" style={{ background: 'rgba(0,122,255,0.12)', color: '#007AFF' }}>{num}</div>
      <div>
        <p className="font-medium">{title}</p>
        <p className="opacity-50 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

function TipRow({ keys, desc }) {
  return (
    <div className="flex justify-between">
      <kbd className="px-1.5 py-0.5 rounded font-mono" style={{ background: 'rgba(0,0,0,0.06)' }}>{keys}</kbd>
      <span>{desc}</span>
    </div>
  );
}
