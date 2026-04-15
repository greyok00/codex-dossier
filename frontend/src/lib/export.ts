import JSZip from "jszip";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";

import type { CaseFileSummary } from "./db";

const EXPORT_LOCAL_DATE_TIME_FORMATTER = new Intl.DateTimeFormat(undefined, {
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

export async function buildCasePdf(summary: CaseFileSummary) {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([612, 792]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const fontSize = 11;
  let cursorY = 752;

  function drawLine(text: string, options?: { bold?: boolean; gapAfter?: number }) {
    const activeFont = options?.bold ? bold : font;
    page.drawText(text, {
      x: 48,
      y: cursorY,
      size: options?.bold ? 14 : fontSize,
      font: activeFont,
      color: rgb(0.1, 0.14, 0.18),
      maxWidth: 516,
    });
    cursorY -= options?.gapAfter ?? 18;
  }

  drawLine("Dossier case packet", { bold: true, gapAfter: 28 });
  drawLine(`Case reference: ${summary.incident.id}`);
  drawLine(`Created: ${formatLocalDateTime(summary.incident.created_at)}`);
  drawLine(`Case type: ${summary.fact_set?.incident_type ?? summary.incident.category ?? "Not set"}`);
  drawLine(`Location: ${summary.incident.location_address ?? "Not saved"}`, { gapAfter: 24 });

  if (summary.routes.length > 0) {
    const selectedRoute = summary.routes.find((route) => route.selected) ?? summary.routes[0];
    if (selectedRoute) {
      drawLine("Selected route", { bold: true, gapAfter: 20 });
      drawLine(`${selectedRoute.destination_name_snapshot} (${selectedRoute.route_group})`);
      drawLine(`Reason: ${selectedRoute.reason}`);
      drawLine(`Source: ${selectedRoute.source_label}`);
      drawLine(`Trust: ${selectedRoute.trust_level}`, { gapAfter: 24 });
    }
  }

  if (summary.fact_set) {
    drawLine("Key facts", { bold: true, gapAfter: 20 });
    for (const fact of summary.fact_set.key_facts) {
      drawLine(`- ${fact}`);
    }
    cursorY -= 8;
  }

  if (summary.draft_packet) {
    drawLine("Draft report", { bold: true, gapAfter: 20 });
    drawLine(`Subject: ${summary.draft_packet.subject}`);
    for (const line of summary.draft_packet.body.split("\n")) {
      drawLine(line.length > 0 ? line : " ");
    }
    cursorY -= 8;
  }

  if (summary.submission_proof) {
    drawLine("Proof of action", { bold: true, gapAfter: 20 });
    drawLine(`Method: ${summary.submission_proof.method}`);
    drawLine(`Status: ${summary.submission_proof.status}`);
    drawLine(`Confirmation: ${summary.submission_proof.confirmation_number ?? "Not saved"}`);
    drawLine(`Reference: ${summary.submission_proof.external_reference_url ?? "Not saved"}`, { gapAfter: 24 });
  }

  drawLine("Log", { bold: true, gapAfter: 20 });
  for (const entry of summary.custody_log.slice(-8)) {
    drawLine(`${formatLocalDateTime(entry.created_at)} - ${entry.action}`);
  }

  return pdf.save();
}

export async function buildCaseZip(summary: CaseFileSummary) {
  const zip = new JSZip();

  zip.file("case/summary.txt", buildCaseText(summary));

  if (summary.source_evidence?.original_bytes) {
    zip.file("case/original-audio.webm", new Uint8Array(summary.source_evidence.original_bytes));
  }

  if (summary.transcript) {
    zip.file("case/transcript.txt", summary.transcript.full_text);
  }

  if (summary.fact_set) {
    zip.file("case/facts.json", JSON.stringify(summary.fact_set, null, 2));
  }

  if (summary.routes.length > 0) {
    zip.file("case/routes.json", JSON.stringify(summary.routes, null, 2));
  }

  if (summary.draft_packet) {
    zip.file("case/draft-report.txt", `${summary.draft_packet.subject}\n\n${summary.draft_packet.body}`);
  }

  if (summary.submission_proof) {
    zip.file("case/proof-of-action.json", JSON.stringify(summary.submission_proof, null, 2));
  }

  zip.file("case/log.json", JSON.stringify(summary.custody_log, null, 2));

  return zip.generateAsync({ type: "uint8array" });
}

function buildCaseText(summary: CaseFileSummary) {
  const lines = [
    "Dossier case packet",
    `Case reference: ${summary.incident.id}`,
    `Created: ${formatLocalDateTime(summary.incident.created_at)}`,
    `Case type: ${summary.fact_set?.incident_type ?? summary.incident.category ?? "Not set"}`,
    `Location: ${summary.incident.location_address ?? "Not saved"}`,
    "",
    "Facts:",
    ...(summary.fact_set?.key_facts.map((fact) => `- ${fact}`) ?? ["- No confirmed facts saved"]),
    "",
    "Routes:",
    ...(summary.routes.length > 0
      ? summary.routes.map((route) => `- ${route.route_group}: ${route.destination_name_snapshot} (${route.trust_level})`)
      : ["- No routes saved"]),
    "",
    `Draft: ${summary.draft_packet?.subject ?? "Not saved"}`,
    `Proof: ${summary.submission_proof?.status ?? "Not saved"}`,
  ];

  return lines.join("\n");
}

function formatLocalDateTime(value: string) {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return EXPORT_LOCAL_DATE_TIME_FORMATTER.format(parsed);
}
