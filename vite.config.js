import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative base so the built assets resolve correctly whether the app is
  // served at the domain root or at https://<user>.github.io/<repo>/
  base: "./",
});
