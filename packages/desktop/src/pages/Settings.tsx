import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";

export function Settings() {
  const { data: me } = useQuery({
    queryKey: ["me"],
    queryFn: () => api.auth.me(),
  });

  return (
    <div className="page-content">
      <div className="page-header">
        <h1 className="page-title">settings</h1>
      </div>

      <section className="settings-section">
        <h2 className="section-title">account</h2>
        <div className="settings-card">
          <div className="settings-field">
            <span className="settings-field-label">email</span>
            <div className="settings-field-value-row">
              <span className="settings-field-value">{me?.email}</span>
              <span className="settings-verified-badge" title="license verified">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
                  <polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
                verified
              </span>
            </div>
          </div>

          {me?.fullName && (
            <div className="settings-field">
              <span className="settings-field-label">name</span>
              <span className="settings-field-value">{me.fullName}</span>
            </div>
          )}

          <div className="settings-field">
            <span className="settings-field-label">role</span>
            <span className="settings-panel-role">{me?.role}</span>
          </div>

          <div className="settings-field">
            <span className="settings-field-label">member since</span>
            <span className="settings-field-value">
              {me?.createdAt ? new Date(me.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "—"}
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
