export type DossierRuntimeMode = "detached";
export type DossierApiMode = "local" | "backend";

interface DossierFrontendConfig {
  appTitle: string;
  runtimeMode: DossierRuntimeMode;
  apiMode: DossierApiMode;
  backendUrl: string;
  backendHealthPath: string;
}

function env(name: string) {
  const value = import.meta.env[name];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function normalizeUrl(value: string) {
  return value.replace(/\/$/u, "");
}

export function getFrontendConfig(): DossierFrontendConfig {
  return {
    appTitle: env("VITE_DOSSIER_APP_TITLE") ?? "Dossier",
    runtimeMode: "detached",
    apiMode: env("VITE_DOSSIER_API_MODE") === "backend" ? "backend" : "local",
    backendUrl: normalizeUrl(env("VITE_DOSSIER_BACKEND_URL") ?? "http://127.0.0.1:3100"),
    backendHealthPath: env("VITE_DOSSIER_BACKEND_HEALTH_PATH") ?? "/v1/health",
  };
}

export function buildBackendHealthUrl(config = getFrontendConfig()) {
  return `${config.backendUrl}${config.backendHealthPath}`;
}
