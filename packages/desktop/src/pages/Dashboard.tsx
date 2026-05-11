import { Dashboard as SharedDashboard, type DashboardPage } from "@clawster/shared";

type Props = { onNavigate: (page: DashboardPage) => void };

export function Dashboard({ onNavigate }: Props) {
  return <SharedDashboard onNavigate={onNavigate} />;
}
