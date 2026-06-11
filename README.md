# VibeHub

和朋友一起 Vibecoding 的轻量协作工具 — 桌面浮窗 + 增量同步服务器。

### 怎么用

1. WinServer 部署 `vibehub-server`，开放 3456 端口
2. 本地解压 `VibeHub-v1.x.zip`，双击启动
3. 输入服务器 IP → 创建项目 → ↓ 同步 → 打开文件夹开始 Vibecoding
4. 改完点 ↑ 上传 → 朋友 ↓ 同步就能拿到

### 结构

```
vibehub-server/   ← 同步服务器 (Node.js + Express + SQLite)
vibehub-desktop/  ← 桌面客户端 (Electron + React)
```

### 特性

- 增量同步（SHA-256 指纹比对，只传变化文件）
- 磨砂玻璃浮窗（Windows 11 Acrylic）
- 暗色主题
- 多服务器切换
- 用户登录 + 权限管理（管理员审批上传）
- 上传确认清单（勾选文件 + diff 预览）
- 大文件自动分片上传（50MB/片 + 断点续传）
- AI 更新解读 / 项目分析 / 更新日志生成
- 项目聊天 + 编辑历史时间轴
- `.vibeignore` 忽略文件
- 桌面通知 + 窗口置顶
- Claude Code 一键呼起

### 部署服务端

```bash
cd vibehub-server
npm install
node src/index.js   # 前台测试
# 或 pm2 start src/index.js --name vibehub  # 后台持久
```

### 开发

```bash
cd vibehub-desktop
npm install
npm run vite-dev    # 终端1：启动前端
npx electron .      # 终端2：启动桌面
```

### License

MIT
