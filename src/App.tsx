import React from "react";
import { Routes, Route, Link } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ProtectedRoute } from "./components/common/ProtectedRoute";
import { LoginPage } from "./pages/LoginPage";
import { useAuth } from "./hooks/useAuth";

// Minimal verified administrative shell strictly for Phase 2 verification
const AdminVerificationShell: React.FC = () => {
  const { user, logout } = useAuth();

  return (
    <div className="min-h-screen bg-brand-white flex flex-col justify-between">
      <header className="border-b border-brand-border bg-brand-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-brand-deep-blue flex items-center justify-center text-brand-white font-semibold text-sm">
              CD
            </div>
            <span className="font-semibold text-lg text-brand-deep-blue tracking-tight">
              ClassDrop Admin
            </span>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-xs text-brand-slate font-medium hidden sm:inline">
              {user?.email}
            </span>
            <button
              onClick={() => logout()}
              className="text-xs font-medium text-brand-slate hover:text-red-600 px-3 py-1.5 rounded border border-brand-border hover:border-red-200 transition-colors"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-12">
        <div className="border border-brand-border rounded-md p-8 bg-brand-white">
          <div className="flex items-center space-x-2 text-xs font-semibold uppercase tracking-wider text-green-700 bg-green-50 border border-green-200 px-2.5 py-1 rounded w-fit mb-4">
            <span>● Verified Administrator Session Active</span>
          </div>
          <h1 className="text-xl font-semibold text-brand-dark-navy mb-2">
            Administration Access Confirmed
          </h1>
          <p className="text-sm text-brand-slate mb-6">
            Authentication and registry verification succeeded. User is verified in the authoritative Firestore <code className="text-xs bg-brand-off-white px-1.5 py-0.5 rounded border border-brand-border font-mono text-brand-dark-navy">/admins/{user?.uid}</code> collection.
          </p>

          <div className="p-4 rounded bg-brand-off-white border border-brand-border text-xs text-brand-slate leading-relaxed">
            <strong>Phase 2 Scope Boundary:</strong> File uploads, metadata management, and publishing belong to Phase 3. This protected view verifies administrator authentication, session persistence, and authorization guards.
          </div>
        </div>
      </main>

      <footer className="border-t border-brand-border bg-brand-off-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-brand-slate">
          <span>ClassDrop Administrator</span>
          <span>Phase 2: Authentication & Access Control</span>
        </div>
      </footer>
    </div>
  );
};

// Minimal public entry shell
const PublicEntryShell: React.FC = () => {
  return (
    <div className="min-h-screen bg-brand-white flex flex-col justify-between">
      <header className="border-b border-brand-border bg-brand-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded bg-brand-deep-blue flex items-center justify-center text-brand-white font-semibold text-sm">
              CD
            </div>
            <span className="font-semibold text-lg text-brand-deep-blue tracking-tight">
              ClassDrop
            </span>
          </div>
          <Link
            to="/login"
            className="text-xs font-medium text-brand-deep-blue bg-brand-off-white hover:bg-brand-light-blue border border-brand-border px-3 py-1.5 rounded transition-colors"
          >
            Facilitator Login
          </Link>
        </div>
      </header>

      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-12">
        <div className="border border-brand-border rounded-md p-8 bg-brand-white">
          <h1 className="text-xl font-semibold text-brand-dark-navy mb-2">
            ClassDrop Classroom Portal
          </h1>
          <p className="text-sm text-brand-slate">
            Zero-auth student access hub. Published learning materials will appear here in Phase 4.
          </p>
        </div>
      </main>

      <footer className="border-t border-brand-border bg-brand-off-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-brand-slate">
          <span>ClassDrop Classroom Utility</span>
          <span>Zero-Auth Student Access</span>
        </div>
      </footer>
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/" element={<PublicEntryShell />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/admin/*"
          element={
            <ProtectedRoute>
              <AdminVerificationShell />
            </ProtectedRoute>
          }
        />
      </Routes>
    </AuthProvider>
  );
};

export default App;
