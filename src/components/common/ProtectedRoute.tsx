import React from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../../hooks/useAuth";

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const { user, isAdmin, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen bg-brand-white flex items-center justify-center p-4">
        <div className="flex flex-col items-center space-y-3">
          <div
            className="w-8 h-8 border-2 border-brand-royal-blue border-t-transparent rounded-full animate-spin"
            role="status"
            aria-label="Loading"
          />
          <span className="text-sm font-medium text-brand-slate">
            Verifying administrative permissions...
          </span>
        </div>
      </div>
    );
  }

  if (!user || !isAdmin) {
    // Redirect unauthenticated or non-admin users to login, preserving target location
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
};

export default ProtectedRoute;

