import { lazy, Suspense } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { RequireAuth, PublicOnly } from "./components/RequireAuth";
import { Layout } from "./components/Layout";

// Lazy routes: cuts initial JS payload roughly in half. Each page becomes
// a separate chunk fetched on first navigation. The Suspense fallback shows
// briefly only on cold cache; subsequent visits hit the browser cache.
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

export function App() {
  return (
    <Suspense fallback={<PageFallback />}>
      <Routes>
        <Route element={<PublicOnly />}>
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
        </Route>

        <Route element={<RequireAuth />}>
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/sessions" element={<Sessions />} />
            <Route path="/contacts" element={<Contacts />} />
            <Route path="/campaigns" element={<Campaigns />} />
            <Route path="/inbox" element={<Inbox />} />
            <Route path="/chatbot" element={<Chatbot />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/changelog" element={<Changelog />} />
          </Route>
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </Suspense>
  );
}
