import React, { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { useAuth } from "../auth-context";
import { registerSchema } from "../schemas/auth";

type Props = { onNavigateToLogin: () => void };

export function Signup({ onNavigateToLogin }: Props) {
  const { register } = useAuth();
  const [validationError, setValidationError] = useState<string | null>(null);

  const { mutate, isPending, error } = useMutation({
    mutationFn: (data: { fullName?: string; email: string; password: string; licenseKey: string }) =>
      register(data.email, data.password, data.licenseKey, data.fullName || undefined),
  });

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const data = new FormData(form);
    const password = data.get("password") as string;
    const confirm = data.get("confirm") as string;
    const confirmInput = form.elements.namedItem("confirm") as HTMLInputElement;
    if (password !== confirm) {
      confirmInput.setCustomValidity("passwords do not match");
      form.reportValidity();
      return;
    }
    confirmInput.setCustomValidity("");
    const fullName = (data.get("fullName") as string) || undefined;
    const parsed = registerSchema.safeParse({
      email: data.get("email"),
      password,
      fullName,
      licenseKey: (data.get("licenseKey") as string).trim().toUpperCase(),
    });
    if (!parsed.success) {
      setValidationError(parsed.error.issues[0]?.message ?? "invalid input");
      return;
    }
    setValidationError(null);
    mutate(parsed.data);
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
            <label className="auth-label" htmlFor="licenseKey">license key</label>
            <input
              className="auth-input"
              id="licenseKey"
              type="text"
              name="licenseKey"
              placeholder="XXXXX-XXXXX-XXXXX-XXXXX"
              autoComplete="off"
              spellCheck={false}
              required
            />
          </div>

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

          {validationError && <p className="auth-error">{validationError}</p>}
          {error && (
            <p className="auth-error">
              {error.message === "invalid_license_key"
                ? "license key is invalid or already used"
                : error.message}
            </p>
          )}

          <button className="auth-button" type="submit" disabled={isPending}>
            {isPending ? "creating account…" : "create account →"}
          </button>
        </form>

        <p className="auth-footer">
          already have one?{" "}
          <button type="button" className="auth-link" onClick={onNavigateToLogin}>sign in</button>
        </p>
      </div>
    </div>
  );
}
