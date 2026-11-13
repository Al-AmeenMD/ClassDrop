import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { render, screen, act, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AuthProvider, AuthContext } from "../../src/context/AuthContext";
import * as firebaseAuth from "firebase/auth";
import * as firebaseFirestore from "firebase/firestore";

// Shared mutable mock auth instance
const mockAuth: { currentUser: any } = { currentUser: null };

vi.mock("../../src/lib/firebase", () => ({
  get auth() {
    return mockAuth;
  },
  db: {},
  isFirebaseConfigured: true,
}));

vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: vi.fn(),
  signOut: vi.fn(),
}));

vi.mock("firebase/firestore", () => ({
  doc: vi.fn((_db, coll, id) => ({ path: `${coll}/${id}`, id })),
  onSnapshot: vi.fn(),
}));

const TestConsumer: React.FC = () => {
  const auth = React.useContext(AuthContext);
  if (!auth) return <div>No context</div>;

  return (
    <div>
      <div data-testid="user">{auth.user ? auth.user.email : "none"}</div>
      <div data-testid="admin">{auth.isAdmin ? "true" : "false"}</div>
      <div data-testid="loading">{auth.loading ? "true" : "false"}</div>
      <div data-testid="error">{auth.error || "none"}</div>
      <button
        onClick={() =>
          auth.login("admin@classdrop.edu", "password123").catch(() => {})
        }
      >
        Login Admin
      </button>
      <button
        onClick={() =>
          auth.login("invalid@classdrop.edu", "wrongpass").catch(() => {})
        }
      >
        Login Invalid
      </button>
      <button onClick={() => auth.logout()}>Logout</button>
      <button onClick={() => auth.clearError()}>Clear Error</button>
    </div>
  );
};

describe("Authentication & Access Control (AuthContext)", () => {
  let authCallback: (user: any) => void;
  let adminSnapshotSuccessCallback: (snap: any) => void;
  const mockUnsubscribeAdmin = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    mockAuth.currentUser = null;

    vi.mocked(firebaseAuth.onAuthStateChanged).mockImplementation((_auth, cb: any) => {
      authCallback = cb;
      return () => {};
    });

    vi.mocked(firebaseFirestore.onSnapshot).mockImplementation((_docRef: any, onNext: any) => {
      adminSnapshotSuccessCallback = onNext;
      return mockUnsubscribeAdmin;
    });

    vi.mocked(firebaseAuth.signOut).mockImplementation(async () => {
      mockAuth.currentUser = null;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("initializes in loading state and transitions to unauthenticated when no user is signed in", async () => {
    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    act(() => {
      authCallback(null);
    });

    expect(screen.getByTestId("user").textContent).toBe("none");
    expect(screen.getByTestId("admin").textContent).toBe("false");
    expect(screen.getByTestId("loading").textContent).toBe("false");
    expect(screen.getByTestId("error").textContent).toBe("none");
  });

  it("restores existing session on initial load if user is already verified admin", async () => {
    const mockUser = { uid: "admin-uid-1", email: "admin@classdrop.edu" };
    mockAuth.currentUser = mockUser;

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    // Initial auth check with existing user
    act(() => {
      authCallback(mockUser);
    });

    expect(adminSnapshotSuccessCallback).toBeDefined();
    act(() => {
      adminSnapshotSuccessCallback({
        exists: () => true,
        data: () => ({ email: "admin@classdrop.edu", role: "admin" }),
      });
    });

    expect(screen.getByTestId("user").textContent).toBe("admin@classdrop.edu");
    expect(screen.getByTestId("admin").textContent).toBe("true");
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("handles valid administrator login successfully with registry verification", async () => {
    const mockUser = { uid: "admin-uid-1", email: "admin@classdrop.edu" };

    vi.mocked(firebaseFirestore.onSnapshot).mockImplementation((_docRef: any, onNext: any) => {
      adminSnapshotSuccessCallback = onNext;
      // Real onSnapshot emits immediately
      onNext({
        exists: () => true,
        data: () => ({ email: "admin@classdrop.edu", role: "admin" }),
      });
      return mockUnsubscribeAdmin;
    });

    vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockImplementation(async () => {
      mockAuth.currentUser = mockUser;
      act(() => {
        authCallback(mockUser);
      });
      return { user: mockUser } as any;
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    act(() => {
      authCallback(null);
    });

    const user = userEvent.setup();
    await user.click(screen.getByText("Login Admin"));

    expect(screen.getByTestId("user").textContent).toBe("admin@classdrop.edu");
    expect(screen.getByTestId("admin").textContent).toBe("true");
    expect(screen.getByTestId("loading").textContent).toBe("false");
  });

  it("rejects login with invalid credentials and sets user-friendly error message", async () => {
    vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockRejectedValue({
      code: "auth/invalid-credential",
      message: "Invalid credential",
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    act(() => {
      authCallback(null);
    });

    const user = userEvent.setup();
    await user.click(screen.getByText("Login Invalid"));

    expect(screen.getByTestId("user").textContent).toBe("none");
    expect(screen.getByTestId("admin").textContent).toBe("false");
    expect(screen.getByTestId("error").textContent).toBe("Invalid email or password.");
  });

  it("fails closed when authenticated user lacks /admins/{uid} registry document", async () => {
    const nonAdminUser = { uid: "student-uid-99", email: "student@classdrop.edu" };

    vi.mocked(firebaseFirestore.onSnapshot).mockImplementation((_docRef: any, onNext: any) => {
      adminSnapshotSuccessCallback = onNext;
      setTimeout(() => {
        onNext({
          exists: () => false,
          data: () => undefined,
        });
      }, 10);
      return mockUnsubscribeAdmin;
    });

    vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockImplementation(async () => {
      mockAuth.currentUser = nonAdminUser;
      act(() => {
        authCallback(nonAdminUser);
      });
      return { user: nonAdminUser } as any;
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    act(() => {
      authCallback(null);
    });

    const user = userEvent.setup();
    await user.click(screen.getByText("Login Admin"));

    await waitFor(() => {
      expect(screen.getByTestId("error").textContent).toContain("Access denied");
    });

    expect(screen.getByTestId("admin").textContent).toBe("false");
    expect(screen.getByTestId("user").textContent).toBe("none");
    expect(mockUnsubscribeAdmin).toHaveBeenCalled();
  });

  it("detects administrator revocation in real-time and revokes session immediately", async () => {
    const adminUser = { uid: "admin-revoked", email: "former.admin@classdrop.edu" };
    mockAuth.currentUser = adminUser;

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    act(() => {
      authCallback(adminUser);
    });

    act(() => {
      adminSnapshotSuccessCallback({
        exists: () => true,
        data: () => ({ email: "former.admin@classdrop.edu", role: "admin" }),
      });
    });

    expect(screen.getByTestId("admin").textContent).toBe("true");

    // Real-time revocation: document removed
    act(() => {
      adminSnapshotSuccessCallback({
        exists: () => false,
        data: () => undefined,
      });
    });

    expect(screen.getByTestId("admin").textContent).toBe("false");
    expect(screen.getByTestId("user").textContent).toBe("none");
    expect(screen.getByTestId("error").textContent).toContain("Access denied");
    expect(mockUnsubscribeAdmin).toHaveBeenCalled();
  });

  it("logs out cleanly, invalidates listeners, and resets state", async () => {
    const adminUser = { uid: "admin-uid-1", email: "admin@classdrop.edu" };
    mockAuth.currentUser = adminUser;

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    act(() => {
      authCallback(adminUser);
    });

    act(() => {
      adminSnapshotSuccessCallback({
        exists: () => true,
        data: () => ({ role: "admin" }),
      });
    });

    expect(screen.getByTestId("admin").textContent).toBe("true");

    const user = userEvent.setup();
    await user.click(screen.getByText("Logout"));

    expect(screen.getByTestId("admin").textContent).toBe("false");
    expect(screen.getByTestId("user").textContent).toBe("none");
    expect(mockUnsubscribeAdmin).toHaveBeenCalled();
    expect(firebaseAuth.signOut).toHaveBeenCalled();
  });

  it("allows clearing errors via clearError()", async () => {
    vi.mocked(firebaseAuth.signInWithEmailAndPassword).mockRejectedValue({
      code: "auth/too-many-requests",
      message: "Too many attempts",
    });

    render(
      <AuthProvider>
        <TestConsumer />
      </AuthProvider>
    );

    act(() => {
      authCallback(null);
    });

    const user = userEvent.setup();
    await user.click(screen.getByText("Login Invalid"));
    expect(screen.getByTestId("error").textContent).toBe("Too many failed attempts. Please try again later.");

    await user.click(screen.getByText("Clear Error"));
    expect(screen.getByTestId("error").textContent).toBe("none");
  });
});
