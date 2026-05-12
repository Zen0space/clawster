import type { ComponentType } from "react";
import { useAtomValue } from "jotai";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Smartphone,
  Users,
  Send,
  MessageSquare,
  Bot,
  Settings as SettingsIcon,
  LogOut,
} from "lucide-react";
import { userAtom, inboxUnreadAtom } from "../atoms";
import { useAuth } from "../context/AuthContext";
import pkg from "../../package.json";

type IconProps = { size?: number; strokeWidth?: number };

const NAV: { to: string; label: string; key: string; icon: ComponentType<IconProps> }[] = [
  { to: "/dashboard", label: "Dashboard",    key: "dashboard", icon: LayoutDashboard },
  { to: "/sessions",  label: "WhatsApp",     key: "sessions",  icon: Smartphone },
  { to: "/contacts",  label: "Contacts",     key: "contacts",  icon: Users },
  { to: "/campaigns", label: "Campaigns",    key: "campaigns", icon: Send },
  { to: "/inbox",     label: "Inbox",        key: "inbox",     icon: MessageSquare },
  { to: "/chatbot",   label: "AI assistant", key: "chatbot",   icon: Bot },
];

function initialsFor(user: { fullName: string | null; email: string } | null): string {
  if (!user) return "?";
  const name = user.fullName?.trim();
  if (name) {
    const parts = name.split(/\s+/);
    const first = parts[0]?.[0] ?? "";
    const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
    return (first + last).toUpperCase() || name[0].toUpperCase();
  }
  return user.email.slice(0, 2).toUpperCase();
}

export function Layout() {
  const user = useAtomValue(userAtom);
  const inboxUnread = useAtomValue(inboxUnreadAtom);
  const { logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const onChangelog = location.pathname === "/changelog";
  const onSettings = location.pathname === "/settings";

  const displayName = user?.fullName?.trim() || user?.email || "";
  const displaySecondary = user?.fullName?.trim() ? user.email : "";

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="sidebar-brand">
          <span className="auth-brand-dot" />
          <span className="sidebar-brand-name">Clawster</span>
        </div>

        <nav className="sidebar-nav">
          {NAV.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.key}
                to={item.to}
                className={({ isActive }) => `sidebar-nav-item${isActive ? " active" : ""}`}
              >
                <span className="sidebar-nav-icon">
                  <Icon size={16} strokeWidth={2} />
                </span>
                <span className="sidebar-nav-label">{item.label}</span>
                {item.key === "inbox" && inboxUnread > 0 && (
                  <span className="inbox-unread-badge">{inboxUnread}</span>
                )}
                {item.key === "chatbot" && <span className="nav-beta-badge">beta</span>}
              </NavLink>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <button
            type="button"
            className={`sidebar-user${onSettings ? " active" : ""}`}
            title="Open settings"
            onClick={() => navigate(onSettings ? "/dashboard" : "/settings")}
          >
            <span className="sidebar-user-avatar">{initialsFor(user)}</span>
            <span className="sidebar-user-text">
              <span className="sidebar-user-name">{displayName}</span>
              {displaySecondary && (
                <span className="sidebar-user-email">{displaySecondary}</span>
              )}
            </span>
            <span className="sidebar-user-action">
              <SettingsIcon size={14} strokeWidth={2} />
            </span>
          </button>

          <div className="sidebar-footer-actions">
            <button
              type="button"
              className={`sidebar-footer-link${onChangelog ? " active" : ""}`}
              onClick={() => navigate("/changelog")}
              title="What's new"
            >
              v{pkg.version}
            </button>
            <span className="sidebar-footer-sep" aria-hidden="true">·</span>
            <button
              type="button"
              className="sidebar-footer-link sidebar-footer-signout"
              onClick={logout}
            >
              <LogOut size={12} strokeWidth={2} />
              Sign out
            </button>
          </div>
        </div>
      </aside>
      <main className="page-content-wrap"><Outlet /></main>
    </div>
  );
}
