import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";

type Props = { onSignup: () => void };

export function Login({ onSignup }: Props) {
  const { login } = useAuth();

  const { mutate, isPending, error } = useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      login(data.email, data.password),
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    mutate({
      email: form.get("email") as string,
      password: form.get("password") as string,
    });
  }

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-brand">
          <span className="auth-brand-dot" />
          <span className="auth-brand-name">clawster</span>
        </div>

        <div className="auth-heading">
          <h1>sign in</h1>
          <p>enter your credentials to continue</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label" htmlFor="email">email</label>
            <input
              className="auth-input"
              id="email"
              type="email"
              name="email"
              placeholder="admin@example.com"
              autoComplete="email"
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="password">password</label>
            <input
              className="auth-input"
              id="password"
              type="password"
              name="password"
              placeholder="••••••••"
              autoComplete="current-password"
              required
            />
          </div>

          {error && <p className="auth-error">{error.message}</p>}

          <button className="auth-button" type="submit" disabled={isPending}>
            {isPending ? "signing in…" : "sign in →"}
          </button>
        </form>

        <p className="auth-footer">
          no account yet?{" "}
          <button type="button" onClick={onSignup}>create one</button>
        </p>
      </div>
    </div>
  );
}
