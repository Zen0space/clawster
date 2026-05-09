import { Routes, Route, Navigate } from "react-router-dom";
import { Login } from "./pages/Login";
import { Signup } from "./pages/Signup";
import { Dashboard } from "./pages/Dashboard";
import { Sessions } from "./pages/Sessions";
import { Contacts } from "./pages/Contacts";
import { Campaigns } from "./pages/Campaigns";
import { Inbox } from "./pages/Inbox";
import { Chatbot } from "./pages/Chatbot";
import { Settings } from "./pages/Settings";
import { Changelog } from "./pages/Changelog";
import { RequireAuth, PublicOnly } from "./components/RequireAuth";
import { Layout } from "./components/Layout";

export function App() {
  return (
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
  );
}
