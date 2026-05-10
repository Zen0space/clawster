import { useNavigate } from "react-router-dom";
import { Signup as SharedSignup } from "@clawster/shared";

export function Signup() {
  const navigate = useNavigate();
  return <SharedSignup onNavigateToLogin={() => navigate("/login")} />;
}
