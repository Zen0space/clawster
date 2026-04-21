import { useState } from "react";
import { useAuth } from "./context/AuthContext";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { Dashboard } from "./pages/Dashboard";
import { Sessions } from "./pages/Sessions";
import { Contacts } from "./pages/Contacts";
import { Campaigns } from "./pages/Campaigns";

type AuthPage = "login" | "signup";
type AppPage = "dashboard" | "sessions" | "contacts" | "campaigns";

const NAV: { id: AppPage; label: string }[] = [
  { id: "dashboard", label: "dashboard" },
  { id: "sessions", label: "wa sessions" },
  { id: "contacts", label: "contacts" },
  { id: "campaigns", label: "campaigns" },
];

function Layout({ children, page, onNavigate }: {
  children: React.ReactNode;
  page: AppPage;
  onNavigate: (p: AppPage) => void;
}) {
  const { user, logout } = useAuth();
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
              className={`sidebar-nav-item${page === item.id ? " active" : ""}`}
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <p className="sidebar-email">{user?.email}</p>
          <button className="sidebar-signout" onClick={logout}>sign out</button>
        </div>
      </aside>
      <main className="page-content-wrap">{children}</main>
    </div>
  );
}

export function App() {
  const { user, isLoading } = useAuth();
  const [authPage, setAuthPage] = useState<AuthPage>("login");
  const [appPage, setAppPage] = useState<AppPage>("dashboard");

  if (isLoading) return <div className="loading-screen">loading…</div>;

  if (!user) {
    return authPage === "login"
      ? <Login onSignup={() => setAuthPage("signup")} />
      : <Signup onLogin={() => setAuthPage("login")} />;
  }

  return (
    <Layout page={appPage} onNavigate={setAppPage}>
      {appPage === "dashboard" && <Dashboard onNavigate={setAppPage} />}
      {appPage === "sessions" && <Sessions />}
      {appPage === "contacts" && <Contacts />}
      {appPage === "campaigns" && <Campaigns />}
    </Layout>
  );
}
