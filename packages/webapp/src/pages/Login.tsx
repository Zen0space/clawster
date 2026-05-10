import { useNavigate } from "react-router-dom";
import { Login as SharedLogin } from "@clawster/shared";

export function Login() {
  const navigate = useNavigate();
  return <SharedLogin onNavigateToSignup={() => navigate("/signup")} />;
}
