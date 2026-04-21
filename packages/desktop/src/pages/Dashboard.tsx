import { useAtomValue } from "jotai";
import { useQuery } from "@tanstack/react-query";
import { userAtom } from "../atoms";
import { api } from "../lib/api";

type Props = { onNavigate: (page: "dashboard" | "sessions") => void };

export function Dashboard({ onNavigate }: Props) {
  const user = useAtomValue(userAtom);

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.stats(),
    refetchInterval: 30_000,
  });

  return (
    <div className="page-content">
      <div className="page-header">
        <h1 className="page-title">dashboard</h1>
        <p className="page-subtitle">welcome back, {user?.email}</p>
      </div>

      <div className="stat-cards">
        <div className="stat-card">
          <span className="stat-card-value stat-card-green">{stats?.completedCampaigns ?? "—"}</span>
          <span className="stat-card-label">campaigns completed</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-value stat-card-red">{stats?.failedCampaigns ?? "—"}</span>
          <span className="stat-card-label">campaigns failed</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-value stat-card-blue">{stats?.runningCampaigns ?? "—"}</span>
          <span className="stat-card-label">campaigns running</span>
        </div>
        <div className="stat-card">
          <span className="stat-card-value stat-card-green">{stats?.connectedDevices ?? "—"}</span>
          <span className="stat-card-label">devices connected</span>
        </div>
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
