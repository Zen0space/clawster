import { useAtomValue } from "jotai";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { userAtom, inboxUnreadAtom } from "../atoms";
import { useAuth } from "../context/AuthContext";
import pkg from "../../package.json";

const NAV: { to: string; label: string; key: string }[] = [
  { to: "/dashboard", label: "dashboard", key: "dashboard" },
  { to: "/sessions", label: "wa sessions", key: "sessions" },
  { to: "/contacts", label: "contacts", key: "contacts" },
  { to: "/campaigns", label: "campaigns", key: "campaigns" },
  { to: "/inbox", label: "inbox", key: "inbox" },
  { to: "/chatbot", label: "chatbot", key: "chatbot" },
];

export function Layout() {
  const user = useAtomValue(userAtom);
  const inboxUnread = useAtomValue(inboxUnreadAtom);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const onChangelog = location.pathname === "/changelog";
  const onSettings = location.pathname === "/settings";

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="auth-brand-dot" />
          <span className="auth-brand-name">clawster</span>
        </div>
        <nav className="sidebar-nav">
          {NAV.map((item) => (
            <NavLink
              key={item.key}
              to={item.to}
              className={({ isActive }) => `sidebar-nav-item${isActive ? " active" : ""}`}
            >
              {item.label}
              {item.key === "inbox" && inboxUnread > 0 && (
                <span className="inbox-unread-badge">{inboxUnread}</span>
              )}
              {item.key === "chatbot" && <span className="nav-beta-badge">beta</span>}
            </NavLink>
          ))}
        </nav>
        <button
          className={`sidebar-version${onChangelog ? " active" : ""}`}
          title="view changelog"
          onClick={() => navigate("/changelog")}
        >
          v{pkg.version}
        </button>
        <div className="sidebar-footer">
          <div className="sidebar-footer-row">
            <p className="sidebar-email">{user?.email}</p>
            <button
              className={`sidebar-settings${onSettings ? " active" : ""}`}
              title="settings"
              onClick={() => navigate(onSettings ? "/dashboard" : "/settings")}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="3"/>
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
              </svg>
            </button>
          </div>
          <button className="sidebar-signout" onClick={logout}>sign out</button>
        </div>
      </aside>
      <main className="page-content-wrap"><Outlet /></main>
    </div>
  );
}
