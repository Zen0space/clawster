import { lazy, Suspense } from "react";
import { useAtom, useAtomValue, useSetAtom } from "jotai";
import { useAuth } from "./context/AuthContext";
import { userAtom, authLoadingAtom, appPageAtom, authPageAtom, inboxUnreadAtom, type AppPage } from "./atoms";
import pkg from "../package.json";

// Each page becomes its own chunk — first navigation fetches it, subsequent
// visits hit the browser cache. Cuts initial JS payload roughly in half.
const Login = lazy(() => import("./pages/Login").then((m) => ({ default: m.Login })));
const Signup = lazy(() => import("./pages/Signup").then((m) => ({ default: m.Signup })));
const Dashboard = lazy(() => import("./pages/Dashboard").then((m) => ({ default: m.Dashboard })));
const Sessions = lazy(() => import("./pages/Sessions").then((m) => ({ default: m.Sessions })));
const Contacts = lazy(() => import("./pages/Contacts").then((m) => ({ default: m.Contacts })));
const Campaigns = lazy(() => import("./pages/Campaigns").then((m) => ({ default: m.Campaigns })));
const Inbox = lazy(() => import("./pages/Inbox").then((m) => ({ default: m.Inbox })));
const Chatbot = lazy(() => import("./pages/Chatbot").then((m) => ({ default: m.Chatbot })));
const Settings = lazy(() => import("./pages/Settings").then((m) => ({ default: m.Settings })));
const Changelog = lazy(() => import("./pages/Changelog").then((m) => ({ default: m.Changelog })));

function PageFallback() {
  return <div className="page-content"><p className="muted">loading…</p></div>;
}

const NAV: { id: AppPage; label: string }[] = [
  { id: "dashboard", label: "dashboard" },
  { id: "sessions", label: "wa sessions" },
  { id: "contacts", label: "contacts" },
  { id: "campaigns", label: "campaigns" },
  { id: "inbox", label: "inbox" },
  { id: "chatbot", label: "chatbot" },
];

function Layout({ children }: { children: React.ReactNode }) {
  const user = useAtomValue(userAtom);
  const [appPage, setAppPage] = useAtom(appPageAtom);
  const inboxUnread = useAtomValue(inboxUnreadAtom);
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
              {item.id === "inbox" && inboxUnread > 0 && (
                <span className="inbox-unread-badge">{inboxUnread}</span>
              )}
              {item.id === "chatbot" && (
                <span className="nav-beta-badge">beta</span>
              )}
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
    return (
      <Suspense fallback={<PageFallback />}>
        {authPage === "login"
          ? <Login onSignup={() => setAuthPage("signup")} />
          : <Signup onLogin={() => setAuthPage("login")} />}
      </Suspense>
    );
  }

  return (
    <Layout>
      <Suspense fallback={<PageFallback />}>
        {appPage === "dashboard" && <Dashboard onNavigate={setAppPage} />}
        {appPage === "sessions" && <Sessions />}
        {appPage === "contacts" && <Contacts />}
        {appPage === "campaigns" && <Campaigns />}
        {appPage === "inbox" && <Inbox />}
        {appPage === "chatbot" && <Chatbot />}
        {appPage === "settings" && <Settings />}
        {appPage === "changelog" && <Changelog />}
      </Suspense>
    </Layout>
  );
}
