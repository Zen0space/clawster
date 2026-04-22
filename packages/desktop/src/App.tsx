import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useAuth } from "./context/AuthContext";
import { userAtom, authLoadingAtom, appPageAtom, authPageAtom, type AppPage } from "./atoms";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { Dashboard } from "./pages/Dashboard";
import { Sessions } from "./pages/Sessions";
import { Contacts } from "./pages/Contacts";
import { Campaigns } from "./pages/Campaigns";
import { Settings } from "./pages/Settings";
import { Changelog } from "./pages/Changelog";
import pkg from "../package.json";

const NAV: { id: AppPage; label: string }[] = [
  { id: "dashboard", label: "dashboard" },
  { id: "sessions", label: "wa sessions" },
  { id: "contacts", label: "contacts" },
  { id: "campaigns", label: "campaigns" },
];

function Layout({ children }: { children: React.ReactNode }) {
  const user = useAtomValue(userAtom);
  const [appPage, setAppPage] = useAtom(appPageAtom);
  const { logout } = useAuth();

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="auth-brand-dot" />
          <span className="auth-brand-name">clawster</span>
        </div>
        <nav className="sidebar-nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              className={`sidebar-nav-item${appPage === item.id ? " active" : ""}`}
              onClick={() => setAppPage(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <button
          className={`sidebar-version${appPage === "changelog" ? " active" : ""}`}
          title="view changelog"
          onClick={() => setAppPage("changelog")}
        >
          v{pkg.version}
        </button>
        <div className="sidebar-footer">
          <div className="sidebar-footer-row">
            <p className="sidebar-email">{user?.email}</p>
            <button
              className={`sidebar-settings${appPage === "settings" ? " active" : ""}`}
              title="settings"
              onClick={() => setAppPage(appPage === "settings" ? "dashboard" : "settings")}
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
      <main className="page-content-wrap">{children}</main>
    </div>
  );
}

export function App() {
  const user = useAtomValue(userAtom);
  const isLoading = useAtomValue(authLoadingAtom);
  const [authPage, setAuthPage] = useAtom(authPageAtom);
  const setAppPage = useSetAtom(appPageAtom);
  const appPage = useAtomValue(appPageAtom);

  if (isLoading) return <div className="loading-screen">loading…</div>;

  if (!user) {
    return authPage === "login"
      ? <Login onSignup={() => setAuthPage("signup")} />
      : <Signup onLogin={() => setAuthPage("login")} />;
  }

  return (
    <Layout>
      {appPage === "dashboard" && <Dashboard onNavigate={setAppPage} />}
      {appPage === "sessions" && <Sessions />}
      {appPage === "contacts" && <Contacts />}
      {appPage === "campaigns" && <Campaigns />}
      {appPage === "settings" && <Settings />}
      {appPage === "changelog" && <Changelog />}
    </Layout>
  );
}
