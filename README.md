# Creator Cockpit｜自媒体内容经营驾驶舱

一个面向个人创作者的本地内容工作台，把今日推进、档期规划、内容制作、阶段目标、发布和复盘放在同一个看板里。

无需注册账号，也不依赖云端数据库。内容、脚本、指标和复盘记录默认只保存在你当前浏览器的 IndexedDB 中。

## 核心能力

- 今日 Todo：按内容阶段推进并勾选完成。
- 本周总览：自动汇总本周需要处理的内容与发布进度。
- 档期规划：拖拽安排大纲、脚本、录制、剪辑和发布，也可创建复盘日与直播日程。
- 内容管线：从灵感一路推进到发布、复盘与归档。
- 大目标：查看粉丝、内容产出和质量指标。
- 复盘实验室：记录数据快照、星级评价、分析与内容规则。
- 本地备份：完整 JSON 导出、合并导入和覆盖恢复。
- 可选 AI：未配置密钥时生成可复制提示词，配置后可直接分析。

## 最简单的安装方式：交给 Agent

项目自带安装型 Skill：

[查看 install-creator-cockpit Skill](./skill/install-creator-cockpit/SKILL.md)

把 Skill 全文交给具备本地文件和终端操作能力的 Agent，然后告诉它：

> 帮我在本机安装并打开 Creator Cockpit。

Agent 会检查运行环境、下载固定版本、安装依赖并打开本地看板，不会覆盖已有目录，也不会要求你在聊天中发送 API Key。

## 手动安装

需要：

- Git
- Node.js `>=22.13.0`
- Corepack / pnpm

```bash
git clone --branch v1.0.0 https://github.com/AverrryHu/creator-cockpit.git
cd creator-cockpit
corepack enable
pnpm install --frozen-lockfile
pnpm dev
```

根据终端提示打开本地地址，默认是 [http://localhost:3000](http://localhost:3000)。

首次进入时可以选择示例工作区或空白工作区，并填写自己的姓名、平台与内容方向。

## 数据保存在哪里

- 工作区数据保存在打开看板所使用浏览器的 IndexedDB 中。
- 源代码目录中不包含你的内容数据。
- 更换浏览器、清理站点数据或改用其他端口时，可能会看到一个新的空白工作区。
- 请定期在「设置与备份」中导出完整 JSON。
- 更新版本前，建议先导出一次备份，并继续使用相同浏览器和本地地址。

## 可选 AI 配置

不配置密钥也可以使用全部内容管理功能。AI 按钮会生成一份可复制的完整提示词。

如果希望直接在看板内获得分析：

1. 将 `.env.example` 复制为 `.env.local`。
2. 在本机文件中填写 `OPENAI_API_KEY`。
3. 重新启动本地服务。

不要把 API Key 提交到 GitHub，也不要发送到公开聊天中。

## 更新

先在看板中导出备份，再让 Agent 使用同一份 Skill 执行：

> 帮我把 Creator Cockpit 更新到最新稳定版本，保留现有本地数据。

Skill 会优先使用 GitHub Release，并保持原来的本地地址。不同版本之间的数据结构会自动迁移。

## 开发与验证

```bash
pnpm dev
pnpm test
pnpm lint
```

主要代码：

- `app/Cockpit.tsx`：页面与交互
- `app/lib/model.ts`：数据结构
- `app/lib/storage.ts`：IndexedDB、备份和迁移
- `app/lib/workflow.ts`：内容阶段与排期规则
- `app/api/ai/analyze/route.ts`：AI 分析与提示词降级

## 许可

本项目采用 [MIT License](./LICENSE)。
