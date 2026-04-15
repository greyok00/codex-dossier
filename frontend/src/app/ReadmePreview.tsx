import {
  CheckCircle2,
  FileText,
  MapPinned,
  Mic,
  NotebookPen,
  Package,
  Shield,
} from "lucide-react";

export function ReadmePreview() {
  return (
    <div className="app-shell">
      <div className="app-shell__content">
        <main className="screen">
          <header className="content-header">
            <h1 className="screen-title">Dossier</h1>
            <p className="screen-body">
              Dossier turns a recording into a documented case you can review, report, and export.
            </p>
          </header>

          <section className="settings-card">
            <div className="section-heading">
              <div>
                <p className="summary-stat-card__eyebrow">Preview Case</p>
                <h2>Phoenix consumer billing complaint</h2>
              </div>
              <div className="route-card__chips">
                <span className="status-chip status-chip--selected">Ready to send</span>
                <span className="status-chip status-chip--official">Official source</span>
              </div>
            </div>
            <div className="summary-hero-grid">
              <article className="summary-stat-card">
                <div className="summary-stat-card__icon">
                  <Mic aria-hidden="true" />
                </div>
                <div>
                  <p className="summary-stat-card__eyebrow">Capture</p>
                  <h2>Recording saved</h2>
                </div>
                <p>Original audio preserved with hash verification and a custody log.</p>
              </article>

              <article className="summary-stat-card">
                <div className="summary-stat-card__icon">
                  <MapPinned aria-hidden="true" />
                </div>
                <div>
                  <p className="summary-stat-card__eyebrow">Where To Report</p>
                  <h2>Arizona Consumer Complaint</h2>
                </div>
                <div className="summary-stat-card__meta">
                  <span className="status-chip status-chip--state">State</span>
                  <span className="status-chip status-chip--official">Official</span>
                </div>
              </article>

              <article className="summary-stat-card">
                <div className="summary-stat-card__icon">
                  <Shield aria-hidden="true" />
                </div>
                <div>
                  <p className="summary-stat-card__eyebrow">Proof</p>
                  <h2>Confirmation saved</h2>
                </div>
                <p>Submission details are tracked so the case file shows what was sent and when.</p>
              </article>
            </div>
          </section>

          <section className="report-preview-card">
            <div className="report-preview-card__header">
              <div>
                <p className="report-document__eyebrow">Report Preview</p>
                <h2>Draft ready for review</h2>
              </div>
              <div className="report-preview-card__badge">
                <FileText aria-hidden="true" />
                Official complaint draft
              </div>
            </div>
            <article className="report-document">
              <header className="report-document__header">
                <p className="report-document__eyebrow">Prepared by Dossier</p>
                <h2>Consumer billing complaint</h2>
              </header>

              <dl className="report-document__meta">
                <div>
                  <dt>Destination</dt>
                  <dd>Arizona Consumer Complaint</dd>
                </div>
                <div>
                  <dt>Method</dt>
                  <dd>Official web form</dd>
                </div>
                <div>
                  <dt>Source</dt>
                  <dd>azag.gov</dd>
                </div>
              </dl>

              <section className="report-document__section">
                <h3>Summary</h3>
                <div className="report-document__body">
                  <p>I was charged twice by Desert Market in Phoenix, Arizona.</p>
                  <p>The manager refused to refund the extra $85 charge after I asked for a correction.</p>
                  <p>Dossier prepared the incident details, selected the reporting route, and packaged the evidence.</p>
                </div>
              </section>

              <section className="report-document__section">
                <h3>Included items</h3>
                <ul className="report-document__attachments">
                  <li>
                    <CheckCircle2 aria-hidden="true" />
                    Original recording with hash
                  </li>
                  <li>
                    <NotebookPen aria-hidden="true" />
                    Transcript and structured facts
                  </li>
                  <li>
                    <Package aria-hidden="true" />
                    Export packet and proof record
                  </li>
                </ul>
              </section>
            </article>
          </section>
        </main>
      </div>
    </div>
  );
}
