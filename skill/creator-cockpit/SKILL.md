---
name: creator-cockpit
description: 在本机安装、启动、更新或修复 Creator Cockpit 创作者管理看板。适用于用户希望搭建个人内容工作台、从 GitHub 安装 Creator Cockpit、恢复本地备份，或排查 Node.js 与 pnpm 运行环境问题的场景。
---

# 安装创作者管理看板

使用以下 GitHub 仓库中的最新稳定版本：

`https://github.com/AverrryHu/creator-cockpit`

## 保护本地数据

- 创建目录前先询问用户希望安装到哪里。
- 确认准确的目标路径，不要覆盖已有内容的目录。
- 未经用户明确确认和备份，不要删除或替换已有安装。
- 不要让用户在聊天中发送 API Key；直接使用 AI 分析是可选能力。
- 尽量保持相同的浏览器、浏览器用户和本地地址，默认使用 `http://localhost:3000`。IndexedDB 数据与浏览器和访问地址绑定。
- 更新或修复前，如果看板仍能打开，先让用户在「设置与备份」中导出完整 JSON 备份。
- 如果数据看起来消失了，先检查浏览器用户、主机名和端口，再考虑恢复备份。

## 安装

1. 检查操作系统，并确认已安装 Git 和 Node.js 22.13 或更高版本。
2. 检查 pnpm，优先使用 `package.json` 中声明的包管理器版本。
3. 如果缺少运行环境，说明最小必要改动；安装系统软件前先征得用户同意。
4. 查询 `https://api.github.com/repos/AverrryHu/creator-cockpit/releases/latest`，读取 `tag_name` 作为最新稳定版本。不要依赖 Skill 文本中记录的历史版本号；如果 API 没有返回稳定 Release，停止安装并说明原因。
5. 将上一步得到的最新稳定标签克隆到用户确认的空目录：

   `git clone --branch <最新稳定标签> --depth 1 https://github.com/AverrryHu/creator-cockpit.git <目标目录>`

6. 进入项目目录。如果没有 pnpm，运行 `corepack enable`；如果需要管理员权限，先向用户说明，并在获得同意后使用合适的用户级方案。
7. 运行 `pnpm install --frozen-lockfile`。
8. 除非用户明确希望在看板内直接调用 AI，否则不要创建 `.env.local`。
9. 在持续运行的终端会话中执行 `pnpm dev`，使用终端显示的准确本地地址。
10. 不要静默更换端口。如果 3000 端口被占用，询问用户是停止其他服务还是改用新端口，并说明不同端口会拥有独立的本地数据空间。
11. 打开准确的本地地址并保持服务运行，告诉用户如何停止和重新启动。
12. 首次进入时，让用户选择示例工作区或空白工作区，并填写姓名、内容平台和创作方向。

## 配置可选 AI

1. 将 `.env.example` 复制为 `.env.local`。
2. 让用户只在本机文件中填写 API Key，不要在聊天中索取或展示密钥。
3. 重新启动本地服务。
4. 未配置密钥时，生成可复制提示词属于正常降级行为。

## 更新

1. 先从看板导出完整 JSON 备份。
2. 保持原安装目录、浏览器用户、主机名和端口不变。
3. 通过 GitHub Releases API 查询最新稳定标签，并用 `git describe --tags --always` 检查当前安装版本；向用户说明版本变化。
4. 未经明确同意，不要重置或丢弃用户对源代码的本地修改。
5. 如果工作区干净，运行 `git fetch --tags --force`，再切换到选定的稳定标签；如果存在本地修改，先停止并让用户决定保留方式。
6. 运行 `pnpm install --frozen-lockfile`。
7. 运行 `pnpm test`，通过后重新启动看板。
8. 确认已有本地数据可以正常打开，数据结构迁移已经完成。

## 修复

1. 读取完整的启动错误或浏览器错误。
2. 检查 Node.js、pnpm 版本以及 `pnpm-lock.yaml` 是否存在。
3. 运行 `pnpm install --frozen-lockfile`；如果仍然无法启动，再运行 `pnpm test`。
4. 不要把清除浏览器数据当作排错捷径。
5. 如果检查浏览器和访问地址后数据仍不可用，只从用户指定的 JSON 备份恢复，并先使用看板的导入预览。
