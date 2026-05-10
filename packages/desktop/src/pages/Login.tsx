import { Login as SharedLogin } from "@clawster/shared";

type Props = { onSignup: () => void };

export function Login({ onSignup }: Props) {
  return <SharedLogin onNavigateToSignup={onSignup} />;
}
