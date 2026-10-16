# Margin — frontend

React 19 + TypeScript + Vite + Tailwind CSS v4. See the [root README](../README.md) for setup, architecture and the demo flow.

```bash
npm install
npm run dev        # http://localhost:5173 (proxies /api to http://localhost:5000)
npm run typecheck
npm run lint
npm run build
```

Set `API_PROXY_TARGET` to proxy to a backend on another port during development, and `VITE_API_URL` for production builds (see `.env.example`).
