import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      // Any request to /api/* from the frontend dev server gets forwarded
      // to the FastAPI backend running on port 8000. This avoids CORS
      // issues during local development.
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
})