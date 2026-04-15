import type { ReactNode } from "react";
import { Link, NavLink } from "react-router-dom";
import { ArrowRight, type LucideIcon } from "lucide-react";

import { GlassTextarea } from "@/components/glass-textarea";
import { GlassBadge } from "@/components/ui/glass-badge";
import { GlassButton } from "@/components/ui/glass-button";
import { GlassCard, GlassCardContent, GlassCardDescription, GlassCardHeader, GlassCardTitle } from "@/components/ui/glass-card";
import type { LocalAiProgressEvent } from "@/lib/runtime";

import { formatProgressBytes, formatProgressStage } from "./helpers";

export function FullScreenShell({
  title,
  body,
  detail,
  actionSlot,
}: {
  title: string;
  body: string;
  detail?: string;
  actionSlot: ReactNode;
}) {
  return (
    <main className="shell">
      <GlassCard className="shell-card" glowEffect>
        <div aria-label="Dossier brand" className="brand-lockup">
          <img alt="Dossier folder mark" className="brand-mark brand-mark--small" src="/brand/dossier-mark.svg" />
          <span className="brand-lockup__wordmark">DOSSIER</span>
        </div>
        <h1 className="shell-title">{title}</h1>
        <p className="shell-body">{body}</p>
        {detail ? <p className="shell-detail">{detail}</p> : null}
        <div className="shell-actions">{actionSlot}</div>
      </GlassCard>
    </main>
  );
}

export function EmptyState({ title, detail }: { title: string; detail: string }) {
  return (
    <GlassCard className="empty-state" glowEffect={false}>
      <h2>{title}</h2>
      <p>{detail}</p>
    </GlassCard>
  );
}

export function LoadingScreen({ title, body }: { title: string; body: string }) {
  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">{title}</h1>
        <p className="screen-body">{body}</p>
      </header>
      <section className="settings-card">
        <div className="loading-pulse" />
      </section>
    </main>
  );
}

export function ProgressPanel({
  progress,
  title,
  emptyMessage,
}: {
  progress: LocalAiProgressEvent | null;
  title: string;
  emptyMessage: string;
}) {
  const determinate = typeof progress?.progress === "number" && Number.isFinite(progress.progress);
  const progressValue = determinate ? Math.max(0, Math.min(100, progress.progress ?? 0)) : undefined;

  return (
    <GlassCard className="progress-panel" aria-live="polite" glowEffect={false}>
      <GlassCardHeader className="pb-4">
        <div className="section-heading">
          <GlassCardTitle>{title}</GlassCardTitle>
          {determinate ? <GlassBadge variant="outline">{Math.round(progressValue ?? 0)}%</GlassBadge> : null}
        </div>
        <GlassCardDescription>{progress?.label ?? emptyMessage}</GlassCardDescription>
      </GlassCardHeader>
      <GlassCardContent>
        <div className="progress-track" aria-hidden="true">
          <div className="progress-track__value" style={determinate ? { width: `${progressValue ?? 0}%` } : undefined} />
        </div>
        {progress ? (
          <dl className="detail-list">
            <div>
              <dt>Stage</dt>
              <dd>{formatProgressStage(progress.stage)}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{progress.model ?? "Local speech tools"}</dd>
            </div>
            <div>
              <dt>File</dt>
              <dd>{progress.file ?? "Current bundle"}</dd>
            </div>
            <div>
              <dt>Progress</dt>
              <dd>{formatProgressBytes(progress.loaded_bytes, progress.total_bytes)}</dd>
            </div>
          </dl>
        ) : null}
      </GlassCardContent>
    </GlassCard>
  );
}

export function ScreenMessage({
  title,
  body,
  action,
  footer,
}: {
  title: string;
  body: string;
  action: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="screen">
      <header className="content-header">
        <h1 className="screen-title">{title}</h1>
        <p className="screen-body">{body}</p>
      </header>
      <GlassCard className="settings-card" glowEffect={false}>
        {action}
        {footer}
      </GlassCard>
    </main>
  );
}

export function WalkthroughHint({
  body,
  step,
  title,
}: {
  body: string;
  step: number;
  title: string;
}) {
  return (
    <GlassCard className="settings-card settings-card--walkthrough settings-card--highlight" aria-live="polite">
      <h2>
        Step {step}: {title}
      </h2>
      <p>{body}</p>
    </GlassCard>
  );
}

export function PrimaryButton({
  className,
  children,
  disabled,
  icon: Icon,
  iconEnd: IconEnd,
  onClick,
}: {
  className?: string | undefined;
  children: ReactNode;
  disabled?: boolean;
  icon?: LucideIcon;
  iconEnd?: LucideIcon;
  onClick: () => void;
}) {
  return (
    <GlassButton className={className} disabled={disabled} onClick={onClick} type="button" variant="primary">
      {Icon ? <Icon aria-hidden="true" className="button-icon" /> : null}
      {children}
      {IconEnd ? <IconEnd aria-hidden="true" className="button-icon" /> : null}
    </GlassButton>
  );
}

export function FactSummaryCard({
  label,
  value,
  values,
}: {
  label: string;
  value?: string;
  values?: string[];
}) {
  const normalizedValues = values?.filter((entry) => entry.trim().length > 0) ?? [];
  const displayValue = value?.trim() ?? "";

  return (
    <section className="fact-summary-card">
      <h2>{label}</h2>
      {displayValue ? <p className="fact-summary-card__value">{displayValue}</p> : null}
      {!displayValue ? <FactPillList items={normalizedValues} emptyLabel={`No ${label.toLowerCase()} found.`} /> : null}
    </section>
  );
}

export function FactPillList({ items, emptyLabel }: { items: string[]; emptyLabel: string }) {
  if (items.length === 0) {
    return <p className="fact-empty">{emptyLabel}</p>;
  }

  return (
    <ul className="pill-list">
      {items.map((item) => (
        <li className="pill-list__item" key={item}>
          {item}
        </li>
      ))}
    </ul>
  );
}

export function FactTimelinePreview({ timeline }: { timeline: Array<{ time_label: string; description: string }> }) {
  if (timeline.length === 0) {
    return <p className="fact-empty">No timeline items were pulled from this capture.</p>;
  }

  return (
    <ol className="timeline-preview">
      {timeline.map((item, index) => (
        <li className="timeline-preview__item" key={`${item.time_label}:${item.description}:${index}`}>
          <strong>{item.time_label || "Time not set"}</strong>
          <span>{item.description}</span>
        </li>
      ))}
    </ol>
  );
}

export function FactsTextarea({
  label,
  onChange,
  placeholder,
  rows,
  value,
}: {
  label: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  value: string;
}) {
  return (
    <GlassTextarea
      label={label}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      rows={rows ?? 4}
      value={value}
    />
  );
}

export function InlineError({ message }: { message: string }) {
  return (
    <GlassCard className="inline-message inline-message--error" glowEffect={false}>
      <p className="inline-error">{message}</p>
    </GlassCard>
  );
}

export function InlineNote({ message }: { message: string }) {
  return (
    <GlassCard className="inline-message inline-message--note" glowEffect={false}>
      <p className="inline-note">{message}</p>
    </GlassCard>
  );
}

export function LinkButton({
  children,
  className,
  icon: Icon,
  iconEnd: IconEnd,
  to,
}: {
  children: ReactNode;
  className?: string | undefined;
  icon?: LucideIcon;
  iconEnd?: LucideIcon;
  to: string;
}) {
  return (
    <GlassButton asChild className={className} variant="outline">
      <Link to={to}>
        {Icon ? <Icon aria-hidden="true" className="button-icon" /> : null}
        {children}
        {IconEnd ? <IconEnd aria-hidden="true" className="button-icon" /> : <ArrowRight aria-hidden="true" className="button-icon" />}
      </Link>
    </GlassButton>
  );
}

export function TabLink({ children, icon: Icon, to }: { children: ReactNode; icon?: LucideIcon; to: string }) {
  return (
    <NavLink className={({ isActive }) => (isActive ? "bottom-nav__link is-active" : "bottom-nav__link")} to={to}>
      {Icon ? <Icon aria-hidden="true" className="button-icon tab-link__icon" /> : null}
      {children}
    </NavLink>
  );
}
