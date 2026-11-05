import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { tanstackRouter } from "@tanstack/router-plugin/vite";

// IRTrack's web app is a static single-page app (built into dist/) that server/index.ts serves
// next to the REST API. Routes are files in src/routes (TanStack Router file-based routing).
export default defineConfig({
  plugins: [
    // Must come before the React plugin: it generates src/routeTree.gen.ts and splits routes.
    tanstackRouter({ target: "react", autoCodeSplitting: true }),
    react(),
    tailwindcss(),
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
  ],
  resolve: {
    dedupe: ["react", "react-dom", "@tanstack/react-query"],
  },
  server: {
    port: 8080,
    // Local development: `bun run server` (API on port 3000) next to `bun run dev`.
    proxy: { "/api": "http://localhost:3000", "/mcp": "http://localhost:3000" },
  },
});
