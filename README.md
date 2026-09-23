<p align="center">
  <a href="https://tdesign.tencent.com/" target="_blank">
    <img alt="TDesign Logo" width="200" src="https://tdesign.gtimg.com/starter/brand-logo.svg">
  </a>
</p>

<p align="center">
  <a href="https://nodejs.org/en/about/releases/"><img src="https://img.shields.io/badge/node-%3E%3D20.19%20%3C25-brightgreen" alt="node compatibility"></a>
  <a href="./LICENSE">
    <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License">
  </a>
</p>

English | [简体中文](./README-zh_CN.md)

> This repository is a **TDesign community project**. It is **not** built, maintained, or endorsed by the official Tencent TDesign team!

### Introduction

**TDesign Status** is a self-hosted status page built on the TDesign component library. It covers a public status site, incident and maintenance history, and an admin console.

Stack: `Vue 3` + `Vite` + `Pinia` + `TDesign` on the front end; `Fastify` + `SQLite` (`better-sqlite3` / Drizzle) on the back end.

![tdesign-status public status page example](./docs/status.png)

### Features

- Public status page: ongoing maintenance, component health, and maintenance history
- Responsive layout for mobile
- Theme modes inherited from TDesign
- Lightweight single process: API + static SPA
- Free PaaS deploy (Render / Koyeb); see [DEPLOY.md](./DEPLOY.md)

### Requirements

- Node.js `>=20.19.0 <25` (tooling such as ESLint 10 works best on 20.19+, 22.13+, or 24+)
- The host must be able to compile `better-sqlite3` (Python + a C++ toolchain)

### Quick start

```bash
cp .env.example .env
# set STATUS_ADMIN_USERNAME / STATUS_ADMIN_PASSWORD

npm install
npm run db:migrate
npm run db:seed
npm run dev
```

- App / API (dev): `http://127.0.0.1:3000` (see `.env`)
- Vite client (dev): usually `http://127.0.0.1:3002`
- Readiness probe: `GET /api/health/live`

### Deploy

**Render** (Blueprint + `render.yaml`) or **Koyeb** (`Dockerfile`) are recommended for cloud hosting.

You can also run it with Docker directly:

```bash
docker build -t tdesign-status .
docker run --rm -p 3000:3000 \
  -e STATUS_ADMIN_USERNAME=admin \
  -e STATUS_ADMIN_PASSWORD='change-me-1234567' \
  -e STATUS_ADMIN_MUST_CHANGE=false \
  -e STATUS_AUTO_SEED=true \
  -e STATUS_TRUST_PROXY=true \
  tdesign-status
```

### Environment variables

| Variable | Description |
|----------|-------------|
| `STATUS_ADMIN_*` | Admin account |
| `STATUS_DB_PATH` | SQLite path |
| `PORT` / `STATUS_PORT` | Listen port |
| `STATUS_HOST` | Listen address |
| `STATUS_AUTO_SEED` | Auto-fill demo data on an empty database |
| `STATUS_TRUST_PROXY` | Set to `true` behind an HTTPS reverse proxy |

### Browser support

| Edge | Firefox | Chrome | Safari |
|------|---------|--------|--------|
| >=84 | >=83 | >=84 | >=14.1 |

### License

MIT. See [LICENSE](./LICENSE). Upstream TDesign materials remain under their own licenses.
