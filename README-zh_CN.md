<p align="center">
  <a href="https://tdesign.tencent.com/" target="_blank">
    <img alt="TDesign Logo" width="200" src="https://tdesign.gtimg.com/starter/brand-logo.svg">
  </a>
</p>

<p align="center">
  <a href="https://nodejs.org/en/about/releases/"><img src="https://img.shields.io/badge/node-%3E%3D24-brightgreen" alt="node compatibility"></a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  </a>
</p>

简体中文 | [English](./README.md)

> 本仓库为 **TDesign 社区项目**，**并非**腾讯 TDesign 官方团队开发、维护或背书的产品！

### 简介

**TDesign Status** 是基于 TDesign 组件库开发的自托管的状态页，涵盖了公开状态页、故障与维护历史，以及管理中台。

技术栈：前端 `Vue 3` + `Vite` + `Pinia` + `TDesign`，后端 `Fastify` + `SQLite`（`better-sqlite3` / Drizzle）。

![tdesign-status 公开状态页示例](./docs/status.png)

### 特性

- 公开状态页：包含进行中的维护、组件状态、维护历史
- 自适应移动端布局
- 继承 TDesign 的主题模式
- 轻量化单进程：API + 静态 SPA
- 免费 PaaS 部署（Render / Koyeb）；见 [DEPLOY.md](./DEPLOY.md)

### 环境要求

- Node.js `>=24`（`node:24` 镜像、`nodejs_24` Nix 包与 Render 的 `yarn` 构建均以此为准）
- 构建需能编译 `better-sqlite3`（本机需 Python + C++ 工具链）

### 快速开始

```bash
cp .env.example .env
# 填写 STATUS_ADMIN_USERNAME / STATUS_ADMIN_PASSWORD

npm ci
npm run db:migrate
npm run db:seed
npm run dev
```

`yarn install --frozen-lockfile` 等价可用；仓库同时提交 `package-lock.json` 与 `yarn.lock`（Render 走 yarn）。

- 应用 / API（开发）：`http://127.0.0.1:3000`（以 `.env` 为准）
- Vite 前端（开发）：通常 `http://127.0.0.1:3002`
- 就绪接口：`GET /api/health/live`

### 本地检查

```bash
npm run lint        # eslint + prettier + vue 规则（有 warning 即失败）
npm run stylelint
npm run typecheck   # src 用 vue-tsc，server 用 tsc
npm run test
npm run build       # vue-tsc + vite 生产构建
```

### 部署

推荐使用 **Render**（Blueprint + `render.yaml`）或 **Koyeb**（`Dockerfile`）作为云托管。

但也允许直接 Docker 部署：

```bash
docker build -t tdesign-status .
docker run --rm -p 3000:3000 \
  -e STATUS_ADMIN_USERNAME=admin \
  -e STATUS_ADMIN_PASSWORD='change-me-1234567' \
  -e STATUS_ADMIN_MUST_CHANGE=false \
  -e STATUS_AUTO_SEED=true \
  -e STATUS_TRUST_PROXY=false \
  tdesign-status
```

### 环境变量

| 变量 | 描述 |
|------|------|
| `STATUS_ADMIN_*` | 管理员 |
| `STATUS_DB_PATH` | SQLite 路径 |
| `PORT` / `STATUS_PORT` | 监听端口 |
| `STATUS_HOST` | 监听地址 |
| `STATUS_AUTO_SEED` | 自动填充模拟数据 |
| `STATUS_TRUST_PROXY` | 默认 `false` 不信任 `X-Forwarded-For`；`true` 只信任 1 跳；也可填跳数或可信代理 IP/CIDR 列表 |
| `STATUS_PROBES_ENABLED` | 默认 `false`。开启后按 `service_probes` 里的点位定义周期探测，结果写入样本并聚合到服务状态 |
| `STATUS_PROBE_INTERVAL_SECONDS` | 新建点位的默认探测间隔，默认 `60` |
| `STATUS_PROBE_TIMEOUT_MS` | 单次探测超时，默认 `5000` |
| `STATUS_PROBE_CONCURRENCY` | 同时进行的探测数上限，默认 `4` |

### 浏览器兼容

| Edge | Firefox | Chrome | Safari |
|------|---------|--------|--------|
| >=84 | >=83 | >=84 | >=14.1 |

### 开源协议

MIT，见 [LICENSE](./LICENSE)。上游 TDesign 相关内容仍遵循其各自协议。
