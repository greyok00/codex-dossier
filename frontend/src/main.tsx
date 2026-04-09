import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { App } from "./App";
import "./styles.css";

installBrowserPolyfills();

const queryClient = new QueryClient();

const container = document.getElementById("root");

if (!container) {
  throw new Error("Root container not found.");
}

void prepareClientRuntime().finally(() => {
  createRoot(container).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </StrictMode>,
  );
});

async function prepareClientRuntime() {
  if (typeof window === "undefined") {
    return;
  }

  if (!isLocalhost(window.location.hostname)) {
    return;
  }

  await unregisterLocalServiceWorkers();
  await clearLocalhostPwaCaches();
}

async function unregisterLocalServiceWorkers() {
  if (!("serviceWorker" in navigator)) {
    return;
  }

  const registrations = await navigator.serviceWorker.getRegistrations().catch(() => []);
  await Promise.allSettled(registrations.map((registration) => registration.unregister()));
}

async function clearLocalhostPwaCaches() {
  if (!("caches" in window)) {
    return;
  }

  const cacheKeys = await caches.keys().catch(() => []);
  const pwaCacheKeys = cacheKeys.filter((key) => {
    const normalized = key.toLowerCase();
    return (
      normalized.includes("workbox") ||
      normalized.includes("precache") ||
      normalized.includes("vite-plugin-pwa")
    );
  });
  await Promise.allSettled(pwaCacheKeys.map((key) => caches.delete(key)));
}

function isLocalhost(hostname: string) {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function installBrowserPolyfills() {
  if (typeof window === "undefined") {
    return;
  }

  if (typeof Promise.withResolvers !== "function") {
    Promise.withResolvers = function withResolversPolyfill<T>() {
      let resolve!: (value: T | PromiseLike<T>) => void;
      let reject!: (reason?: unknown) => void;
      const promise = new Promise<T>((innerResolve, innerReject) => {
        resolve = innerResolve;
        reject = innerReject;
      });
      return {
        promise,
        resolve,
        reject,
      };
    };
  }

  if (typeof window.requestIdleCallback !== "function") {
    window.requestIdleCallback = (callback: IdleRequestCallback) => {
      const start = Date.now();
      return window.setTimeout(() => {
        callback({
          didTimeout: false,
          timeRemaining: () => Math.max(0, 50 - (Date.now() - start)),
        });
      }, 1);
    };
  }

  if (typeof window.cancelIdleCallback !== "function") {
    window.cancelIdleCallback = (handle: number) => {
      window.clearTimeout(handle);
    };
  }

  if (typeof window.queueMicrotask !== "function") {
    window.queueMicrotask = (callback: VoidFunction) => {
      Promise.resolve()
        .then(callback)
        .catch((error) => {
          window.setTimeout(() => {
            throw error;
          }, 0);
        });
    };
  }
}
