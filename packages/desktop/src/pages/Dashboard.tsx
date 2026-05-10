import { Dashboard as SharedDashboard } from "@clawster/shared";

type Props = { onNavigate: (page: "dashboard" | "sessions") => void };

export function Dashboard({ onNavigate }: Props) {
  return <SharedDashboard onNavigate={onNavigate} />;
}
