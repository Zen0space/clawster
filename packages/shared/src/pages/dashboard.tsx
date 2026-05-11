import type { ReactNode } from "react";
import { useAtomValue } from "jotai";
import { useQuery } from "@tanstack/react-query";
import {
  CheckCircle2,
  XCircle,
  PlayCircle,
  Smartphone,
  Users,
  Send,
  MessageSquare,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import { userAtom } from "../atoms";
import { api } from "../api";

type Page =
  | "dashboard"
  | "sessions"
  | "contacts"
  | "campaigns"
  | "inbox"
  | "chatbot";

type Props = { onNavigate: (page: Page) => void };

export function Dashboard({ onNavigate }: Props) {
  const user = useAtomValue(userAtom);

  const { data: stats } = useQuery({
    queryKey: ["stats"],
    queryFn: () => api.stats(),
    refetchInterval: 30_000,
  });

  const firstName =
    user?.fullName?.trim().split(/\s+/)[0] ||
    user?.email?.split("@")[0] ||
    "there";

  return (
    <div className="page-content">
      <section className="dashboard-hero">
        <div className="dashboard-hero-greeting">Welcome back, {firstName}</div>
        <div className="dashboard-hero-sub">
          Here's a quick look at your campaigns and connected devices.
        </div>
      </section>

      <div className="stat-cards">
        <StatCard
          icon={<CheckCircle2 size={20} strokeWidth={2.25} />}
          tint="green"
          value={stats?.completedCampaigns}
          label="Campaigns completed"
          meta="All time"
        />
        <StatCard
          icon={<PlayCircle size={20} strokeWidth={2.25} />}
          tint="blue"
          value={stats?.runningCampaigns}
          label="Campaigns running"
          meta="In progress now"
        />
        <StatCard
          icon={<XCircle size={20} strokeWidth={2.25} />}
          tint="red"
          value={stats?.failedCampaigns}
          label="Campaigns with issues"
          meta="Needs attention"
        />
        <StatCard
          icon={<Smartphone size={20} strokeWidth={2.25} />}
          tint="amber"
          value={stats?.connectedDevices}
          label="Devices connected"
          meta="Linked WhatsApp accounts"
        />
      </div>

      <div className="dashboard-section-title">Quick actions</div>

      <div className="quick-actions">
        <QuickAction
          icon={<Smartphone size={18} />}
          title="Link a WhatsApp account"
          desc="Connect a device by scanning a QR code"
          onClick={() => onNavigate("sessions")}
        />
        <QuickAction
          icon={<Users size={18} />}
          title="Manage contacts"
          desc="Upload a CSV or add people one by one"
          onClick={() => onNavigate("contacts")}
        />
        <QuickAction
          icon={<Send size={18} />}
          title="Start a campaign"
          desc="Send a personalized message to a list"
          onClick={() => onNavigate("campaigns")}
        />
        <QuickAction
          icon={<MessageSquare size={18} />}
          title="Read replies"
          desc="See what your contacts have said"
          onClick={() => onNavigate("inbox")}
        />
        <QuickAction
          icon={<Sparkles size={18} />}
          title="Set up the AI assistant"
          desc="Have the bot reply to common questions"
          onClick={() => onNavigate("chatbot")}
        />
      </div>
    </div>
  );
}

type Tint = "green" | "red" | "blue" | "amber";

function StatCard({
  icon,
  tint,
  value,
  label,
  meta,
}: {
  icon: ReactNode;
  tint: Tint;
  value: number | undefined;
  label: string;
  meta: string;
}) {
  return (
    <div className="stat-card">
      <div className={`stat-card-icon stat-card-icon-${tint}`}>{icon}</div>
      <div className="stat-card-body">
        <div className="stat-card-value">{value ?? "—"}</div>
        <div className="stat-card-label">{label}</div>
        <div className="stat-card-meta">{meta}</div>
      </div>
    </div>
  );
}

function QuickAction({
  icon,
  title,
  desc,
  onClick,
}: {
  icon: ReactNode;
  title: string;
  desc: string;
  onClick: () => void;
}) {
  return (
    <button type="button" className="quick-action" onClick={onClick}>
      <span className="quick-action-icon">{icon}</span>
      <span className="quick-action-body">
        <span className="quick-action-title">{title}</span>
        <span className="quick-action-desc">{desc}</span>
      </span>
      <span className="quick-action-arrow">
        <ChevronRight size={18} />
      </span>
    </button>
  );
}
