import React, { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { Eye, EyeOff, AlertCircle, ArrowLeft } from "lucide-react";
import { useAuth } from "../hooks/useAuth";

export const LoginPage: React.FC = () => {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);

  const { login, user, isAdmin, loading, error: authError, clearError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as any)?.from?.pathname || "/admin";

  useEffect(() => {
    // If already authenticated and verified as admin, redirect to destination
    if (!loading && user && isAdmin) {
      navigate(from, { replace: true });
    }
  }, [user, isAdmin, loading, navigate, from]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalError(null);
    clearError();

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setLocalError("Please enter your email address.");
      return;
    }

    if (!password) {
      setLocalError("Please enter your password.");
      return;
    }

    setIsSubmitting(true);
    try {
      await login(trimmedEmail, password);
      // Navigation is handled declaratively by the useEffect hook once
      // administrator permissions are verified via the live Firestore snapshot listener.
    } catch {
      // Auth context sets the descriptive error message
    } finally {
      setIsSubmitting(false);
    }
  };

  const displayError = localError || authError;

  return (
    <div className="min-h-screen bg-brand-white flex flex-col justify-between">
      {/* Minimal Header */}
      <header className="border-b border-brand-border bg-brand-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link to="/" className="flex items-center space-x-3 text-brand-deep-blue hover:opacity-90">
            <div className="w-8 h-8 rounded bg-brand-deep-blue flex items-center justify-center text-brand-white font-semibold text-sm">
              CD
            </div>
            <span className="font-semibold text-lg tracking-tight">ClassDrop</span>
          </Link>
          <Link
            to="/"
            className="inline-flex items-center text-xs font-medium text-brand-slate hover:text-brand-dark-navy transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5 mr-1" />
            Classroom Portal
          </Link>
        </div>
      </header>

      {/* Main Login Card */}
      <main className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-[400px]">
          <div className="border border-brand-border rounded-md p-8 bg-brand-white shadow-sm">
            <div className="mb-6">
              <h1 className="text-xl font-semibold text-brand-dark-navy tracking-tight">
                Facilitator Sign In
              </h1>
              <p className="text-sm text-brand-slate mt-1">
                Enter your credentials to access the administration portal.
              </p>
            </div>

            {displayError && (
              <div
                role="alert"
                className="mb-5 p-3 rounded bg-red-50 border border-red-200 text-xs text-red-700 flex items-start space-x-2.5"
              >
                <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
                <span className="leading-relaxed">{displayError}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="email"
                  className="block text-xs font-semibold uppercase tracking-wider text-brand-dark-navy mb-1.5"
                >
                  Email Address
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    if (displayError) {
                      setLocalError(null);
                      clearError();
                    }
                  }}
                  disabled={isSubmitting}
                  placeholder="facilitator@school.edu"
                  className="w-full px-3 py-2 text-sm border border-brand-border rounded-md bg-brand-white text-brand-dark-navy placeholder-brand-slate/60 focus:outline-none focus:ring-2 focus:ring-brand-royal-blue/20 focus:border-brand-royal-blue transition-colors disabled:bg-brand-off-white disabled:cursor-not-allowed"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="block text-xs font-semibold uppercase tracking-wider text-brand-dark-navy mb-1.5"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (displayError) {
                        setLocalError(null);
                        clearError();
                      }
                    }}
                    disabled={isSubmitting}
                    placeholder="Enter your password"
                    className="w-full px-3 py-2 pr-10 text-sm border border-brand-border rounded-md bg-brand-white text-brand-dark-navy placeholder-brand-slate/60 focus:outline-none focus:ring-2 focus:ring-brand-royal-blue/20 focus:border-brand-royal-blue transition-colors disabled:bg-brand-off-white disabled:cursor-not-allowed"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-brand-slate hover:text-brand-dark-navy p-1 focus:outline-none"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="w-full py-2.5 px-4 bg-brand-royal-blue hover:bg-blue-700 active:bg-blue-800 text-brand-white font-medium text-sm rounded-md transition-colors focus:outline-none focus:ring-2 focus:ring-brand-royal-blue/40 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "Signing in..." : "Sign In to Administration"}
                </button>
              </div>
            </form>
          </div>

          <div className="mt-6 text-center">
            <Link
              to="/"
              className="text-xs text-brand-slate hover:text-brand-dark-navy transition-colors"
            >
              ← Return to Public Student Portal
            </Link>
          </div>
        </div>
      </main>

      {/* Institutional Footer */}
      <footer className="border-t border-brand-border bg-brand-off-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-brand-slate">
          <span>ClassDrop Administrator Access</span>
          <span>Security Phase 2: Verified Registry Only</span>
        </div>
      </footer>
    </div>
  );
};

export default LoginPage;

