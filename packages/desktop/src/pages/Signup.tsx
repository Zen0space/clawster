import { Signup as SharedSignup } from "@clawster/shared";

type Props = { onLogin: () => void };

export function Signup({ onLogin }: Props) {
  return <SharedSignup onNavigateToLogin={onLogin} />;
}
