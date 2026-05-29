import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import netlify from "@netlify/vite-plugin";

export default defineConfig({
  plugins: [react(), netlify()],
  server: {
    // Moved off the common Vite/dev ports (5173, 3000, 8888) so it doesn't
    // collide with another app running locally.
    port: 5280,
    strictPort: true,
  },
  preview: {
    port: 5281,
    strictPort: true,
  },
});
