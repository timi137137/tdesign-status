# 免费托管部署说明

本项目是 **Vue SPA + Fastify 常驻进程 + 本地 SQLite（better-sqlite3）**。  
适合「有 Node 长进程」的 PaaS；**不适合**纯 Serverless（Vercel Functions / Cloudflare Workers）原样部署。

## 平台结论（2026-09）

| 平台 | 免费可用性 | 是否适配本仓库 | 说明 |
|------|------------|----------------|------|
| **Render** Web Service | 有（约 750 机时/月，空闲 15 分钟休眠） | **推荐** | 使用仓库内 `render.yaml`（Native Node） |
| **Koyeb** Free Instance | 有（每组织 1 个，空闲约 1 小时 scale-to-zero） | **推荐** | 使用仓库内 `Dockerfile` |
| Railway | 基本无可用免费额度 | 可用 Docker | 有额度时用 `Dockerfile` |
| Vercel | Hobby 免费 | **不能**直接跑本后端 | 无常驻 Node、无本地 SQLite |
| Fly.io | 新账号基本无免费机 | 需付费 Volume | 架构可行，但不免费 |
| Cloudflare Pages/Workers | 有免费额度 | 需重写 | Workers + D1，非直接部署 |

## Render（推荐）

1. 推送仓库到 GitHub / GitLab / Bitbucket。
2. Render → **New** → **Blueprint** → 选本仓库。
3. 填写 `STATUS_ADMIN_USERNAME` / `STATUS_ADMIN_PASSWORD`。
4. 打开 `https://<service>.onrender.com`；健康检查 `GET /api/health/live`。

Free 无持久盘；`STATUS_AUTO_SEED=true` 时空库会自动 seed。空闲约 15 分钟休眠。

## Koyeb / Railway（Dockerfile）

```bash
docker build -t tdesign-status .
docker run --rm -p 3000:3000 \
  -e STATUS_ADMIN_USERNAME=admin \
  -e STATUS_ADMIN_PASSWORD='你的强密码' \
  -e STATUS_ADMIN_MUST_CHANGE=false \
  -e STATUS_AUTO_SEED=true \
  -e STATUS_TRUST_PROXY=true \
  tdesign-status
```

## 关键环境变量

| 变量 | 托管建议 |
|------|----------|
| `NODE_ENV` | `production` |
| `PORT` / `STATUS_PORT` | 平台注入即可 |
| `STATUS_HOST` | `0.0.0.0` |
| `STATUS_TRUST_PROXY` | 托管上为 `true` |
| `STATUS_AUTO_SEED` | 免费无盘时 `true` |
| `STATUS_COOKIE_SECURE` | HTTPS 下开启 |
| `STATUS_ADMIN_USERNAME` / `STATUS_ADMIN_PASSWORD` | 自动 seed 时必填 |

## 为何不做 Vercel 原生全栈

Serverless 无本地 SQLite；`better-sqlite3` 与 Fastify 长进程模型都不适配。若要上 Vercel/Workers，需另做 Turso/D1 改造。
