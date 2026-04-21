import { useAuth } from "../context/AuthContext";

type Props = { onNavigate: (page: "dashboard" | "sessions") => void };

export function Dashboard({ onNavigate }: Props) {
  const { user } = useAuth();
  return (
    <div className="page-content">
      <div className="page-header">
        <h1 className="page-title">dashboard</h1>
        <p className="page-subtitle">welcome back, {user?.email}</p>
      </div>
      <div className="dashboard-cards">
        <button className="dash-card" onClick={() => onNavigate("sessions")}>
          <span className="dash-card-icon">◈</span>
          <span className="dash-card-label">wa sessions</span>
          <span className="dash-card-desc">link whatsapp accounts</span>
        </button>
      </div>
    </div>
  );
}
