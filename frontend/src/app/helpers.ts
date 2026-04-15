import type { Dispatch, SetStateAction } from "react";

import type { FactSetRecord, SubmissionProofRecord } from "@/lib/db";
import { FrontendRuntimeError, type FactSetDto, type LocalAiProgressEvent } from "@/lib/runtime";

import type { FactsFormState } from "./types";

const LOCAL_DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  timeZoneName: "short",
});

export const CASE_TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "consumer_issue", label: "Consumer issue" },
  { value: "consumer_billing", label: "Billing or charge problem" },
  { value: "retail_transaction", label: "Retail or purchase issue" },
  { value: "service_quality", label: "Service quality issue" },
  { value: "fraud_or_deception", label: "Fraud or theft" },
  { value: "tenant_issue", label: "Housing or tenant issue" },
  { value: "workplace_wages", label: "Workplace wage issue" },
  { value: "civil_rights", label: "Civil rights issue" },
  { value: "emergency_safety", label: "Emergency or public safety" },
];

export const CASE_TYPE_LABELS = new Map(CASE_TYPE_OPTIONS.map((option) => [option.value, option.label]));

export function formatDuration(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `00:${minutes}:${seconds}`;
}

export function formatTimestampMs(durationMs: number) {
  const totalSeconds = Math.floor(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function formatProgressStage(stage: LocalAiProgressEvent["stage"]) {
  switch (stage) {
    case "download":
      return "Downloading";
    case "load":
      return "Loading";
    case "transcribe":
      return "Transcribing";
    case "ready":
      return "Ready";
  }
}

export function routePriorityLabel(rank: number) {
  if (rank <= 1) {
    return "Best first";
  }
  if (rank <= 3) {
    return "Also useful";
  }
  return "Backup option";
}

export function formatProgressBytes(loadedBytes: number | null, totalBytes: number | null) {
  if (typeof loadedBytes !== "number" || typeof totalBytes !== "number" || totalBytes <= 0) {
    return "In progress";
  }

  return `${formatBytes(loadedBytes)} of ${formatBytes(totalBytes)}`;
}

export function formatLocalDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return LOCAL_DATE_TIME_FORMATTER.format(parsed);
}

export function formatBytes(value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    return "0 B";
  }

  const units = ["B", "KB", "MB", "GB"];
  let size = value;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }

  return `${size.toFixed(size >= 10 || unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

export function resolveLocalAiPreparationError(error: unknown) {
  if (error instanceof FrontendRuntimeError) {
    const detailMessage = extractNestedErrorMessage(error.details);
    return detailMessage ? `${error.message} ${detailMessage}` : error.message;
  }

  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Built-in speech tools could not be loaded on this device.";
}

export function extractNestedErrorMessage(details: unknown) {
  const messages = collectErrorMessages(details);
  return messages.length > 0 ? messages.join(" | ") : null;
}

export function collectErrorMessages(value: unknown, seen = new Set<unknown>()): string[] {
  if (!value || seen.has(value)) {
    return [] as string[];
  }

  if (typeof value === "object" || typeof value === "function") {
    seen.add(value);
  }

  if (value instanceof Error) {
    return uniqueMessages([
      value.name && value.message ? `${value.name}: ${value.message}` : value.message,
      ...collectErrorMessages((value as Error & { cause?: unknown }).cause, seen),
    ]);
  }

  if (typeof value === "string") {
    return value.length > 0 ? [value] : [];
  }

  if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    const direct = [
      typeof record.message === "string" ? record.message : null,
      typeof record.ERROR_MESSAGE === "string" ? `ERROR_MESSAGE: ${record.ERROR_MESSAGE}` : null,
      typeof record.ERROR_CODE === "string" || typeof record.ERROR_CODE === "number"
        ? `ERROR_CODE: ${String(record.ERROR_CODE)}`
        : null,
      typeof record.code === "string" || typeof record.code === "number" ? `code: ${String(record.code)}` : null,
      typeof record.name === "string" && typeof record.message === "string"
        ? `${record.name}: ${record.message}`
        : null,
    ].filter((entry): entry is string => Boolean(entry));

    const nested: string[] = [
      ...collectErrorMessages(record.cause, seen),
      ...collectErrorMessages(record.error, seen),
      ...collectErrorMessages(record.details, seen),
    ];

    return uniqueMessages([...direct, ...nested]);
  }

  return [];
}

export function uniqueMessages(messages: string[]): string[] {
  return [...new Set(messages.filter((message) => message.trim().length > 0))];
}

export function normalizeAppPath(path: string | null) {
  if (!path || !path.startsWith("/")) {
    return null;
  }

  if (path.startsWith("//")) {
    return null;
  }

  return path;
}

export async function copyTextToClipboard(value: string) {
  const trimmed = value.trim();
  if (trimmed.length === 0 || typeof document === "undefined") {
    return false;
  }

  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(trimmed);
      return true;
    }
  } catch {
    // Fall back to the temporary textarea path below.
  }

  const textarea = document.createElement("textarea");
  textarea.value = trimmed;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.select();

  try {
    return document.execCommand("copy");
  } finally {
    textarea.remove();
  }
}

export async function toArrayBuffer(input: Blob | BlobPart) {
  if (typeof input === "object" && input !== null && "arrayBuffer" in input && typeof input.arrayBuffer === "function") {
    return input.arrayBuffer();
  }

  return new Response(input).arrayBuffer();
}

export function arrayBufferToBase64(input: ArrayBuffer) {
  const bytes = new Uint8Array(input);
  let binary = "";
  const chunkSize = 0x8000;

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }

  return btoa(binary);
}

export function copyBuffer(input: Uint8Array) {
  const copy = new Uint8Array(input.byteLength);
  copy.set(input);
  return copy.buffer;
}

export function resolveDeviceUnlockError(error: unknown) {
  if (error instanceof FrontendRuntimeError) {
    if (error.code === "device_unlock_unavailable" || error.code === "device_unlock_failed") {
      return error.message;
    }
  }

  return "Device unlock did not complete.";
}

export function resolveTranscribeError(error: unknown) {
  return resolveBackendActionError(error, "Transcript creation did not complete. Try again.");
}

export function resolveExtractError(error: unknown) {
  return resolveBackendActionError(error, "Details could not be prepared right now.");
}

export function resolveRouteRecommendationError(error: unknown) {
  return resolveBackendActionError(error, "Report options could not be prepared right now.");
}

export function resolveDraftError(error: unknown) {
  return resolveBackendActionError(error, "Draft report could not be prepared right now.");
}

export function resolveBackendActionError(error: unknown, fallbackMessage: string) {
  if (error instanceof FrontendRuntimeError) {
    if (error.code === "backend_unreachable") {
      return "The backend is offline. Saved local case data is still available. Retry after the backend restarts.";
    }

    return error.message;
  }

  return fallbackMessage;
}

export function factSetToForm(factSet: FactSetRecord): FactsFormState {
  return {
    incident_type: factSet.incident_type ?? "",
    people: factSet.people.join("\n"),
    places: factSet.places.join("\n"),
    businesses: factSet.businesses.join("\n"),
    phones: factSet.phones.join("\n"),
    dates: factSet.dates.join("\n"),
    amounts: factSet.amounts.join("\n"),
    timeline: factSet.timeline.map((item) => `${item.time_label} | ${item.description}`).join("\n"),
    key_facts: factSet.key_facts.join("\n"),
  };
}

export function buildFactSummaryCards(form: FactsFormState) {
  const cards: Array<{ label: string; value?: string; values?: string[] }> = [
    {
      label: "Case type",
      value: formatCaseTypeLabel(form.incident_type) || "Not set",
    },
  ];

  const listCards: Array<{ label: string; values: string[] }> = [
    { label: "People named", values: splitLines(form.people) },
    { label: "Place", values: splitLines(form.places) },
    { label: "Business", values: splitLines(form.businesses) },
    { label: "Phone numbers", values: splitLines(form.phones) },
    { label: "Dates", values: splitLines(form.dates) },
    { label: "Amounts", values: splitLines(form.amounts) },
  ];

  for (const card of listCards) {
    if (card.values.length > 0) {
      cards.push(card);
    }
  }

  return cards;
}

export function updateFactsField(
  setFormState: Dispatch<SetStateAction<FactsFormState | null>>,
  field: keyof FactsFormState,
  value: string,
) {
  setFormState((current) => {
    if (!current) {
      return current;
    }

    return {
      ...current,
      [field]: value,
    };
  });
}

export function splitLines(value: string) {
  return value
    .split(/\r?\n/u)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function parseTimeline(value: string) {
  return splitLines(value).map((entry) => {
    const separatorIndex = entry.indexOf("|");
    if (separatorIndex === -1) {
      return {
        time_label: "",
        description: entry,
      };
    }

    return {
      time_label: entry.slice(0, separatorIndex).trim(),
      description: entry.slice(separatorIndex + 1).trim(),
    };
  });
}

export function normalizeOptionalText(value: string) {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function formatCaseTypeLabel(value: string | null | undefined) {
  if (!value) {
    return "";
  }

  const mapped = CASE_TYPE_LABELS.get(value);
  if (mapped) {
    return mapped;
  }

  return value
    .replaceAll("_", " ")
    .replace(/\s+/gu, " ")
    .trim()
    .replace(/\b\w/gu, (char) => char.toUpperCase());
}

export function computeEditedFields(original: FactSetRecord, form: FactsFormState) {
  const editedFields: string[] = [];

  const currentValues = {
    incident_type: normalizeOptionalText(form.incident_type),
    people: splitLines(form.people),
    places: splitLines(form.places),
    businesses: splitLines(form.businesses),
    phones: splitLines(form.phones),
    dates: splitLines(form.dates),
    amounts: splitLines(form.amounts),
    timeline: parseTimeline(form.timeline),
    key_facts: splitLines(form.key_facts),
  };

  if (original.incident_type !== currentValues.incident_type) {
    editedFields.push("incident_type");
  }
  if (JSON.stringify(original.people) !== JSON.stringify(currentValues.people)) {
    editedFields.push("people");
  }
  if (JSON.stringify(original.places) !== JSON.stringify(currentValues.places)) {
    editedFields.push("places");
  }
  if (JSON.stringify(original.businesses) !== JSON.stringify(currentValues.businesses)) {
    editedFields.push("businesses");
  }
  if (JSON.stringify(original.phones) !== JSON.stringify(currentValues.phones)) {
    editedFields.push("phones");
  }
  if (JSON.stringify(original.dates) !== JSON.stringify(currentValues.dates)) {
    editedFields.push("dates");
  }
  if (JSON.stringify(original.amounts) !== JSON.stringify(currentValues.amounts)) {
    editedFields.push("amounts");
  }
  if (JSON.stringify(original.timeline) !== JSON.stringify(currentValues.timeline)) {
    editedFields.push("timeline");
  }
  if (JSON.stringify(original.key_facts) !== JSON.stringify(currentValues.key_facts)) {
    editedFields.push("key_facts");
  }

  return editedFields;
}

export function factSetRecordToDto(factSet: FactSetRecord): FactSetDto {
  return {
    fact_set_id: factSet.id,
    incident_type: factSet.incident_type,
    people: factSet.people,
    places: factSet.places,
    businesses: factSet.businesses,
    phones: factSet.phones,
    dates: factSet.dates,
    amounts: factSet.amounts,
    timeline: factSet.timeline,
    key_facts: factSet.key_facts,
    reviewed_by_user: factSet.reviewed_by_user,
  };
}

export function buildMailtoUrl(email: string | null, subject: string, body: string) {
  const recipient = email ?? "";
  const params = new URLSearchParams({
    subject,
    body,
  });
  return `mailto:${recipient}?${params.toString()}`;
}

export function isSubmissionMethod(value: string): value is SubmissionProofRecord["method"] {
  return ["web_form", "email", "phone", "mail", "share"].includes(value);
}

export function isSubmissionStatus(value: string): value is SubmissionProofRecord["status"] {
  return ["attempted", "sent", "submitted", "shared", "called", "saved"].includes(value);
}
