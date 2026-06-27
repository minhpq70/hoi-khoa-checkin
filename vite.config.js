import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,   // bind 0.0.0.0 — truy cập được từ LAN
    port: 5173,
  },
})
