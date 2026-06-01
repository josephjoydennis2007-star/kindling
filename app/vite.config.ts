import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { inspectAttr } from 'kimi-plugin-inspect-react'

// https://vite.dev/config/
// `base: '/'` produces absolute asset paths (/assets/foo.js) which is what
// Firebase Hosting + the service worker expect. Relative paths break sub-route
// reloads (e.g. /writer reloading would look for assets relative to /writer/).
export default defineConfig({
  base: '/',
  plugins: [inspectAttr(), react()],
  server: {
    port: 3000,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    // Emit source maps so prod stack traces point at real file:line.
    // The repo is public on GitHub anyway — no secrets to hide.
    sourcemap: true,
  },
});
