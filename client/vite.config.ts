import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // changeOrigin: false — оставляем Host как у браузера (localhost:5173),
      // иначе Rails выставит Set-Cookie под 127.0.0.1:3000 и сессия не уйдёт на localhost.
      "/api": {
        target: "http://127.0.0.1:3000",
        changeOrigin: false,
      },
      "/cable": {
        target: "ws://127.0.0.1:3000",
        ws: true,
        changeOrigin: false,
      },
    },
  },
});
