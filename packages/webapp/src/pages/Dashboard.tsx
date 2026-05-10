import { useNavigate } from "react-router-dom";
import { Dashboard as SharedDashboard } from "@clawster/shared";

export function Dashboard() {
  const navigate = useNavigate();
  return <SharedDashboard onNavigate={(page) => navigate(`/${page}`)} />;
}
