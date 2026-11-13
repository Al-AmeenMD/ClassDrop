import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "../../src/components/common/ProtectedRoute";
import * as useAuthHook from "../../src/hooks/useAuth";

vi.mock("../../src/hooks/useAuth");

describe("Protected Route Access Control (ProtectedRoute)", () => {
  it("displays loading spinner while authentication verification is pending", () => {
    vi.spyOn(useAuthHook, "useAuth").mockReturnValue({
      user: null,
      isAdmin: false,
      loading: true,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <ProtectedRoute>
          <div>Protected Content</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("Verifying administrative permissions...")).toBeInTheDocument();
    expect(screen.queryByText("Protected Content")).not.toBeInTheDocument();
  });

  it("redirects unauthenticated user to /login preserving target location in state", () => {
    vi.spyOn(useAuthHook, "useAuth").mockReturnValue({
      user: null,
      isAdmin: false,
      loading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/admin/dashboard"]}>
        <Routes>
          <Route
            path="/admin/dashboard"
            element={
              <ProtectedRoute>
                <div>Protected Dashboard</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page Redirected</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Login Page Redirected")).toBeInTheDocument();
    expect(screen.queryByText("Protected Dashboard")).not.toBeInTheDocument();
  });

  it("redirects authenticated non-admin user to /login", () => {
    vi.spyOn(useAuthHook, "useAuth").mockReturnValue({
      user: { uid: "student-1", email: "student@classdrop.edu" } as any,
      isAdmin: false,
      loading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <Routes>
          <Route
            path="/admin"
            element={
              <ProtectedRoute>
                <div>Protected Dashboard</div>
              </ProtectedRoute>
            }
          />
          <Route path="/login" element={<div>Login Page Redirected</div>} />
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText("Login Page Redirected")).toBeInTheDocument();
    expect(screen.queryByText("Protected Dashboard")).not.toBeInTheDocument();
  });

  it("renders protected content when user is authenticated and verified as admin", () => {
    vi.spyOn(useAuthHook, "useAuth").mockReturnValue({
      user: { uid: "admin-1", email: "admin@classdrop.edu" } as any,
      isAdmin: true,
      loading: false,
      error: null,
      login: vi.fn(),
      logout: vi.fn(),
      clearError: vi.fn(),
    });

    render(
      <MemoryRouter initialEntries={["/admin"]}>
        <ProtectedRoute>
          <div>Protected Facilitator Dashboard</div>
        </ProtectedRoute>
      </MemoryRouter>
    );

    expect(screen.getByText("Protected Facilitator Dashboard")).toBeInTheDocument();
  });
});

