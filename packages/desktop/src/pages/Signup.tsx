import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../context/AuthContext";

type Props = { onLogin: () => void };

export function Signup({ onLogin }: Props) {
  const { register } = useAuth();

  const { mutate, isPending, error } = useMutation({
    mutationFn: (data: { fullName: string; email: string; password: string }) =>
      register(data.email, data.password, data.fullName || undefined),
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const password = form.get("password") as string;
    const confirm = form.get("confirm") as string;
    if (password !== confirm) {
      // Surface as a mutation error by throwing from outside mutate —
      // use a manual approach since FormData validation is synchronous
      e.currentTarget.confirm.setCustomValidity("passwords do not match");
      e.currentTarget.reportValidity();
      return;
    }
    e.currentTarget.confirm.setCustomValidity("");
    mutate({
      fullName: form.get("fullName") as string,
      email: form.get("email") as string,
      password,
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
          <h1>create account</h1>
          <p>set up your admin access</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <div className="auth-field">
            <label className="auth-label" htmlFor="fullName">full name</label>
            <input
              className="auth-input"
              id="fullName"
              type="text"
              name="fullName"
              placeholder="optional"
              autoComplete="name"
            />
          </div>

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
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="confirm">confirm password</label>
            <input
              className="auth-input"
              id="confirm"
              type="password"
              name="confirm"
              placeholder="••••••••"
              autoComplete="new-password"
              required
            />
          </div>

          {error && <p className="auth-error">{error.message}</p>}

          <button className="auth-button" type="submit" disabled={isPending}>
            {isPending ? "creating account…" : "create account →"}
          </button>
        </form>

        <p className="auth-footer">
          already have one?{" "}
          <button type="button" onClick={onLogin}>sign in</button>
        </p>
      </div>
    </div>
  );
}
