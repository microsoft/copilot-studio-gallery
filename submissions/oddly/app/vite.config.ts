import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { managedApps } from "@microsoft/managed-apps-vite-plugin";

export default defineConfig({
  plugins: [react(), managedApps()],
  server: { headers: { "Cache-Control": "no-store" } },
  preview: { headers: { "Cache-Control": "no-store" } },
});
