import { resolve } from "node:path";

import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";
import { defineConfig, loadEnv } from "vite";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, resolve(__dirname, ".."), "");
  const appBase = env.VITE_APP_BASE || "/";
  const shellBuild = env.VITE_APP_SHELL_BUILD === "true";
  const apiProxyTarget =
    env.VITE_DEV_API_PROXY_TARGET ||
    env.VITE_DOSSIER_BACKEND_URL ||
    env.VITE_API_BASE_URL ||
    env.VITE_API_BASE ||
    "http://127.0.0.1:3100";

  return {
    envDir: "..",
    base: appBase,
    plugins: [
      react(),
      tailwindcss(),
      ...(
        shellBuild
          ? []
          : [
              VitePWA({
                injectRegister: null,
                registerType: "autoUpdate",
                includeAssets: ["dossier-icon.svg", "dossier-icon-192.png", "dossier-icon-512.png", "apple-touch-icon.png"],
                workbox: {
                  maximumFileSizeToCacheInBytes: 30 * 1024 * 1024,
                },
                manifest: {
                  name: "Dossier",
                  short_name: "Dossier",
                  description: "Capture once. Build the case. Send it with proof.",
                  theme_color: "#0a1016",
                  background_color: "#05080c",
                  display: "standalone",
                  start_url: "/",
                  scope: "/",
                  icons: [
                    {
                      src: "/dossier-icon-192.png",
                      sizes: "192x192",
                      type: "image/png",
                      purpose: "any",
                    },
                    {
                      src: "/dossier-icon-512.png",
                      sizes: "512x512",
                      type: "image/png",
                      purpose: "any",
                    },
                    {
                      src: "/dossier-icon-512.png",
                      sizes: "512x512",
                      type: "image/png",
                      purpose: "maskable",
                    },
                    {
                      src: "/dossier-icon.svg",
                      sizes: "512x512",
                      type: "image/svg+xml",
                      purpose: "any",
                    },
                  ],
                },
              }),
            ]
      ),
    ],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src"),
      },
    },
    server: {
      host: "0.0.0.0",
      port: 5173,
      fs: {
        allow: [".."],
      },
      proxy: {
        "/v1": {
          target: apiProxyTarget,
          changeOrigin: true,
        },
      },
    },
    preview: {
      host: "0.0.0.0",
      port: 4180,
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) {
              return undefined;
            }

            if (
              id.includes("/react/") ||
              id.includes("/react-dom/") ||
              id.includes("/react-router-dom/") ||
              id.includes("/@tanstack/react-query/")
            ) {
              return "react-vendor";
            }

            if (
              id.includes("/lucide-react/") ||
              id.includes("/framer-motion/") ||
              id.includes("/@radix-ui/") ||
              id.includes("/clsx/") ||
              id.includes("/class-variance-authority/") ||
              id.includes("/tailwind-merge/") ||
              id.includes("/@fontsource/")
            ) {
              return "ui-vendor";
            }

            if (id.includes("/pdf-lib/")) {
              return "pdf-vendor";
            }

            if (id.includes("/jszip/")) {
              return "zip-vendor";
            }

            if (id.includes("/dexie/")) {
              return "storage-vendor";
            }

            if (
              id.includes("/@huggingface/transformers/") ||
              id.includes("/transformers.web")
            ) {
              return "ai-vendor";
            }

            if (id.includes("/onnxruntime-web/")) {
              return "onnx-vendor";
            }

            return undefined;
          },
        },
      },
    },
    test: {
      environment: "jsdom",
      globals: true,
      setupFiles: "./src/test/setup.ts",
      css: true,
    },
  };
});
