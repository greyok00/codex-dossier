import {
  CheckCircle2,
  MapPinned,
  Mic,
  NotebookPen,
  Package,
  ScrollText,
  Shield,
  Sparkles,
} from "lucide-react";

function OverviewPreview() {
  return (
    <div className="app-shell">
      <div className="app-shell__content">
        <main className="screen">
          <section className="quick-guide-card quick-guide-card--global">
            <div className="section-heading">
              <div>
                <p className="summary-stat-card__eyebrow">Quickstart guide</p>
                <h2>Keep the case moving</h2>
              </div>
              <span className="status-chip status-chip--selected">Visible on all pages</span>
            </div>
            <p>
              Start a case, confirm the facts, choose a destination, approve the brief, then save
              the filing receipt. The dossier stays on this device.
            </p>
          </section>

          <header className="content-header">
            <h1 className="screen-title">Cases</h1>
            <p className="screen-body">
              Dossier keeps every case, brief, and filing receipt in one local-first record.
            </p>
          </header>

          <section className="case-home-section">
            <article className="case-home-hero">
              <div className="case-home-hero__header">
                <div>
                  <p className="summary-stat-card__eyebrow">Active case</p>
                  <h2>Phoenix consumer billing complaint</h2>
                </div>
                <div className="route-card__chips">
                  <span className="status-chip status-chip--selected">Ready to file</span>
                  <span className="status-chip status-chip--official">Official route</span>
                </div>
              </div>
              <p className="screen-body">
                The case is documented, the destination is selected, and the official brief is
                ready to send.
              </p>
              <div className="case-home-hero__stats">
                <article className="case-home-stat">
                  <span className="case-home-stat__label">Destination</span>
                  <strong>Arizona consumer complaint</strong>
                </article>
                <article className="case-home-stat">
                  <span className="case-home-stat__label">Evidence</span>
                  <strong>Audio, transcript, facts, proof</strong>
                </article>
              </div>
            </article>

            <div className="summary-hero-grid">
              <article className="summary-stat-card">
                <div className="summary-stat-card__icon">
                  <Mic aria-hidden="true" />
                </div>
                <div>
                  <p className="summary-stat-card__eyebrow">Start a case</p>
                  <h2>Recording saved</h2>
                </div>
                <p>Original audio is preserved with a hash, timestamp, and chain-of-custody log.</p>
              </article>

              <article className="summary-stat-card">
                <div className="summary-stat-card__icon">
                  <ScrollText aria-hidden="true" />
                </div>
                <div>
                  <p className="summary-stat-card__eyebrow">Review</p>
                  <h2>Facts confirmed</h2>
                </div>
                <p>Transcript highlights, structured fields, and location context are ready.</p>
              </article>

              <article className="summary-stat-card">
                <div className="summary-stat-card__icon">
                  <MapPinned aria-hidden="true" />
                </div>
                <div>
                  <p className="summary-stat-card__eyebrow">Destinations</p>
                  <h2>6 reporting options</h2>
                </div>
                <div className="summary-stat-card__meta">
                  <span className="status-chip status-chip--state">State</span>
                  <span className="status-chip status-chip--official">Official</span>
                  <span className="status-chip status-chip--verified">Verified</span>
                </div>
              </article>

              <article className="summary-stat-card">
                <div className="summary-stat-card__icon">
                  <Shield aria-hidden="true" />
                </div>
                <div>
                  <p className="summary-stat-card__eyebrow">Filing receipt</p>
                  <h2>Confirmation preserved</h2>
                </div>
                <p>The submission trail can be saved as proof inside the same dossier.</p>
              </article>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

function BriefPreview() {
  return (
    <div className="app-shell">
      <div className="app-shell__content">
        <main className="screen">
          <header className="content-header">
            <h1 className="screen-title">Dossier</h1>
            <p className="screen-body">
              The brief and filing receipt stay paired with the recording, facts, and destination.
            </p>
          </header>

          <section className="report-preview-card">
            <div className="report-preview-card__header">
              <div>
                <p className="report-document__eyebrow">Official brief</p>
                <h2>Ready for review</h2>
              </div>
              <div className="report-preview-card__badge">
                <Sparkles aria-hidden="true" />
                Ready to copy
              </div>
            </div>

            <article className="report-document">
              <header className="report-document__header report-document__header--luxury">
                <div className="report-document__seal">
                  <strong>Dossier</strong>
                  <span>Prepared brief</span>
                </div>
                <div>
                  <p className="report-document__eyebrow">Consumer billing complaint</p>
                  <h2>Duplicated charge and refused refund</h2>
                </div>
              </header>

              <div className="report-document__provenance">
                <div>
                  <span>Destination</span>
                  <strong>Arizona consumer complaint</strong>
                </div>
                <div>
                  <span>Delivery</span>
                  <strong>Official web form</strong>
                </div>
                <div>
                  <span>Source</span>
                  <strong>azag.gov</strong>
                </div>
              </div>

              <dl className="report-document__meta">
                <div>
                  <dt>Summary</dt>
                  <dd>Charged twice for the same purchase after a point-of-sale error.</dd>
                </div>
                <div>
                  <dt>Requested fix</dt>
                  <dd>Refund of the duplicate $85 charge and correction of the account record.</dd>
                </div>
              </dl>

              <section className="report-document__section">
                <h3>Statement</h3>
                <div className="report-document__body">
                  <p>
                    I was charged twice by Desert Market in Phoenix, Arizona, for a single
                    purchase. I returned the same day and asked the manager to correct the extra
                    charge.
                  </p>
                  <p>
                    The manager declined to issue a refund. Dossier prepared this brief from the
                    preserved recording, transcript, and confirmed case details.
                  </p>
                </div>
              </section>

              <section className="report-document__section">
                <h3>Included in this dossier</h3>
                <ul className="report-document__attachments">
                  <li>
                    <CheckCircle2 aria-hidden="true" />
                    Original recording with hash verification
                  </li>
                  <li>
                    <NotebookPen aria-hidden="true" />
                    Transcript and structured fact record
                  </li>
                  <li>
                    <Package aria-hidden="true" />
                    Case packet and filing proof log
                  </li>
                </ul>
              </section>
            </article>
          </section>

          <section className="receipt-card receipt-card--ledger receipt-card--compact">
            <div className="receipt-card__header">
              <div>
                <p className="receipt-card__eyebrow">Filing receipt</p>
                <h2>Submission recorded</h2>
              </div>
              <div className="route-card__chips">
                <span className="status-chip status-chip--selected">Saved to dossier</span>
              </div>
            </div>
            <div className="receipt-card__grid">
              <div>
                <dt>Confirmation</dt>
                <dd>AZ-CC-2026-0414-1188</dd>
              </div>
              <div>
                <dt>Method</dt>
                <dd>Official form handoff</dd>
              </div>
              <div>
                <dt>Saved</dt>
                <dd>April 14, 2026 at 9:42 PM</dd>
              </div>
              <div>
                <dt>Next step</dt>
                <dd>Monitor reply and keep the packet for records.</dd>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

export function ReadmePreview() {
  const section =
    typeof window !== "undefined"
      ? new URLSearchParams(window.location.search).get("section")
      : "overview";

  if (section === "brief") {
    return <BriefPreview />;
  }

  return <OverviewPreview />;
}
