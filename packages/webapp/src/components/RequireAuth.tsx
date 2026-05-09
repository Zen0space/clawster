import { useAtomValue } from "jotai";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { userAtom, authLoadingAtom } from "../atoms";

export function RequireAuth() {
  const user = useAtomValue(userAtom);
  const isLoading = useAtomValue(authLoadingAtom);
  const location = useLocation();

  if (isLoading) return <div className="loading-screen">loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;

  return <Outlet />;
}

export function PublicOnly() {
  const user = useAtomValue(userAtom);
  const isLoading = useAtomValue(authLoadingAtom);

  if (isLoading) return <div className="loading-screen">loading…</div>;
  if (user) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
