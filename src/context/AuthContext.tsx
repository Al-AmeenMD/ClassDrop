import React, { createContext, useEffect, useState, useRef, useCallback } from "react";
import {
  User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db, isFirebaseConfigured } from "../lib/firebase";

export interface AuthContextType {
  user: User | null;
  isAdmin: boolean;
  loading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Monotonically increasing generation counter to eliminate asynchronous race conditions in snapshot listeners
  const authGenerationRef = useRef<number>(0);
  // Monotonically increasing identifier for login operations
  const loginOperationRef = useRef<number>(0);
  // Tracks the login operation ID currently executing its network authentication
  const currentlyExecutingLoginIdRef = useRef<number | null>(null);
  // Serialized execution queue promise ensuring strict FIFO ordering of auth operations
  const authQueueRef = useRef<Promise<void>>(Promise.resolve());
  // Distinguishes initial page-load session restoration from runtime auth changes
  const isInitialAuthCheckRef = useRef<boolean>(true);
  // Active Firestore admin document listener unsubscribe reference
  const adminUnsubscribeRef = useRef<(() => void) | null>(null);

  // Clean up any active admin listener
  const cleanupAdminListener = () => {
    if (adminUnsubscribeRef.current) {
      adminUnsubscribeRef.current();
      adminUnsubscribeRef.current = null;
    }
  };

  // Enqueues an asynchronous auth operation onto the serial queue to prevent overlapping requests
  const enqueueAuthOp = useCallback(<T,>(operation: () => Promise<T>): Promise<T> => {
    return new Promise<T>((resolve, reject) => {
      authQueueRef.current = authQueueRef.current
        .catch(() => {
          // Prevent prior operation errors from breaking the queue chain
        })
        .then(async () => {
          try {
            const result = await operation();
            resolve(result);
          } catch (err) {
            reject(err);
          }
        });
    });
  }, []);

  useEffect(() => {
    if (!isFirebaseConfigured || !auth || !db) {
      setLoading(false);
      return;
    }

    const firebaseAuth = auth;
    const firestoreDb = db;

    const unsubscribeAuth = onAuthStateChanged(firebaseAuth, (currentUser) => {
      // Increment generation ID on every auth state transition
      const currentGeneration = ++authGenerationRef.current;

      // Unsubscribe from any previous administrator document listener immediately
      cleanupAdminListener();

      if (!currentUser) {
        isInitialAuthCheckRef.current = false;
        // Discard update if a newer auth operation has already begun
        if (currentGeneration !== authGenerationRef.current) return;

        setUser(null);
        setIsAdmin(false);
        setLoading(false);
        return;
      }

      // Check whether this authenticated state is authorized to establish an administrator session
      let authorizedLoginId: number;

      if (isInitialAuthCheckRef.current) {
        isInitialAuthCheckRef.current = false;
        // Normal page refresh / initial session restoration from client storage:
        // Valid ONLY if no login operation was initiated prior to initial auth resolution
        if (loginOperationRef.current === 0) {
          authorizedLoginId = 0;
        } else {
          // A login operation already started before Firebase initialized;
          // fail-closed: clear React state and do not attach an administrator listener.
          // The serialized login operation already clears any existing Firebase session before signing in.
          cleanupAdminListener();
          setUser(null);
          setIsAdmin(false);
          setLoading(false);
          return;
        }
      } else {
        // Post-initialization runtime transition:
        // Must match the currently executing, active, non-cancelled login operation ID.
        const executingLoginId = currentlyExecutingLoginIdRef.current;
        if (
          executingLoginId === null ||
          executingLoginId !== loginOperationRef.current
        ) {
          // This authentication event belongs to an invalidated, cancelled, or superseded operation.
          // Reject immediately: do NOT query Firestore or grant administrator access.
          cleanupAdminListener();
          setUser(null);
          setIsAdmin(false);
          setLoading(false);
          return;
        }
        authorizedLoginId = executingLoginId;
      }

      // User is authenticated and verified as non-cancelled; verify against Firestore /admins/{uid}
      setLoading(true);

      const listenerUid = currentUser.uid;
      const adminDocRef = doc(firestoreDb, "admins", listenerUid);

      const unsubscribeSnapshot = onSnapshot(
        adminDocRef,
        async (snapshot) => {
          // Requirement 2: Verify operation ID still matches the current login operation ID
          if (authorizedLoginId !== loginOperationRef.current) {
            return;
          }

          // Requirement 3: Verify authenticated Firebase user still matches the user associated with this listener
          if (!firebaseAuth.currentUser || firebaseAuth.currentUser.uid !== listenerUid) {
            return;
          }

          // Guard: Ignore callbacks from superseded auth generations
          if (currentGeneration !== authGenerationRef.current) {
            return;
          }

          if (snapshot.exists()) {
            setUser(currentUser);
            setIsAdmin(true);
            setError(null);
            setLoading(false);
          } else {
            // Document missing or deleted: immediately fail closed and revoke admin status
            cleanupAdminListener();

            setUser(null);
            setIsAdmin(false);
            setLoading(false);
            setError(
              "Access denied: Your account is not registered in the administrator registry."
            );

            // Serialize sign-out via authentication queue with operation identity & session verification
            enqueueAuthOp(async () => {
              if (
                authorizedLoginId === loginOperationRef.current &&
                currentGeneration === authGenerationRef.current &&
                firebaseAuth.currentUser &&
                firebaseAuth.currentUser.uid === listenerUid
              ) {
                try {
                  await firebaseSignOut(firebaseAuth);
                } catch (signOutErr) {
                  console.warn("Sign-out after registry check failure encountered error:", signOutErr);
                }
              }
            });
          }
        },
        async (err) => {
          // Requirement 2: Verify operation ID still matches the current login operation ID
          if (authorizedLoginId !== loginOperationRef.current) {
            return;
          }

          // Requirement 3: Verify authenticated Firebase user still matches the user associated with this listener
          if (!firebaseAuth.currentUser || firebaseAuth.currentUser.uid !== listenerUid) {
            return;
          }

          // Guard: Ignore callbacks from superseded auth generations
          if (currentGeneration !== authGenerationRef.current) {
            return;
          }

          console.error("Administrator registry onSnapshot listener error:", err);

          // Clean up admin listener immediately and fail closed
          cleanupAdminListener();

          setUser(null);
          setIsAdmin(false);
          setLoading(false);
          setError("Verification failed: Unable to verify administrator permissions.");

          // Serialize sign-out via authentication queue with operation identity & session verification
          enqueueAuthOp(async () => {
            if (
              authorizedLoginId === loginOperationRef.current &&
              currentGeneration === authGenerationRef.current &&
              firebaseAuth.currentUser &&
              firebaseAuth.currentUser.uid === listenerUid
            ) {
              try {
                await firebaseSignOut(firebaseAuth);
              } catch (signOutErr) {
                console.warn("Sign-out after listener error encountered error:", signOutErr);
              }
            }
          });
        }
      );

      adminUnsubscribeRef.current = unsubscribeSnapshot;
    });

    return () => {
      cleanupAdminListener();
      unsubscribeAuth();
    };
  }, []);

  const login = async (email: string, password: string): Promise<void> => {
    if (!isFirebaseConfigured || !auth) {
      const configError = "Firebase configuration is missing or incomplete. Check .env settings.";
      setError(configError);
      throw new Error(configError);
    }

    const firebaseAuth = auth;

    // 1. Synchronously increment operation counter and immediately clean up any previous listener
    const currentLoginId = ++loginOperationRef.current;
    cleanupAdminListener();

    setError(null);
    setLoading(true);

    // 2. Enqueue the login operation into the serialized execution queue
    return enqueueAuthOp(async () => {
      // If this login was cancelled or superseded while waiting in the queue, abort immediately
      if (currentLoginId !== loginOperationRef.current) {
        return;
      }

      // Ensure any pre-existing or rejected session is safely cleared before proceeding with the new sign-in
      if (firebaseAuth.currentUser) {
        cleanupAdminListener();
        try {
          await firebaseSignOut(firebaseAuth);
        } catch (signOutErr) {
          console.error("Sign-out of existing session prior to login failed:", signOutErr);
          setLoading(false);
          const errMsg = "Unable to clear previous session. Please try again.";
          setError(errMsg);
          throw new Error(errMsg);
        }
      }

      // Re-verify after sign-out that this login operation has not been superseded or cancelled
      if (currentLoginId !== loginOperationRef.current) {
        return;
      }

      currentlyExecutingLoginIdRef.current = currentLoginId;

      try {
        // Authenticate with Firebase Auth
        const userCredential = await signInWithEmailAndPassword(
          firebaseAuth,
          email.trim(),
          password
        );

        // Post-sign-in verification: check if this operation is still valid
        if (currentLoginId !== loginOperationRef.current) {
          // Operation was invalidated by logout() or superseded by a newer login attempt.
          // Only sign out if the currentUser is still the user from this stale credential,
          // preserving any newer user session that may have been established concurrently.
          if (firebaseAuth.currentUser && firebaseAuth.currentUser.uid === userCredential.user.uid) {
            cleanupAdminListener();
            try {
              await firebaseSignOut(firebaseAuth);
            } catch (signOutErr) {
              console.warn("Sign-out after cancelled login encountered error:", signOutErr);
            }
          }
          return;
        }
      } catch (err: any) {
        // If this login operation was superseded or cancelled, ignore the error and do not update context error state
        if (currentLoginId !== loginOperationRef.current) {
          return;
        }

        setLoading(false);
        let userFriendlyMessage = "Failed to sign in. Please check your credentials.";

        if (
          err.code === "auth/invalid-credential" ||
          err.code === "auth/user-not-found" ||
          err.code === "auth/wrong-password"
        ) {
          userFriendlyMessage = "Invalid email or password.";
        } else if (err.code === "auth/too-many-requests") {
          userFriendlyMessage = "Too many failed attempts. Please try again later.";
        } else if (err.code === "auth/network-request-failed") {
          userFriendlyMessage = "Network error. Please check your internet connection.";
        } else if (err.message) {
          userFriendlyMessage = err.message;
        }

        setError(userFriendlyMessage);
        throw new Error(userFriendlyMessage);
      } finally {
        if (currentlyExecutingLoginIdRef.current === currentLoginId) {
          currentlyExecutingLoginIdRef.current = null;
        }
      }
    });
  };

  const logout = async (): Promise<void> => {
    // 1. Synchronously and immediately invalidate all pending login operations
    loginOperationRef.current++;
    currentlyExecutingLoginIdRef.current = null;

    // Advance generation counter to immediately invalidate any in-flight callbacks
    authGenerationRef.current++;

    // Unsubscribe from live administrator listener immediately
    cleanupAdminListener();

    // Reset authorization state immediately to safe unauthenticated state
    setUser(null);
    setIsAdmin(false);
    setError(null);
    setLoading(false);

    // 2. Enqueue the sign-out operation to guarantee it executes after any in-flight sign-in has settled
    return enqueueAuthOp(async () => {
      if (auth) {
        try {
          await firebaseSignOut(auth);
        } catch (signOutErr) {
          console.warn("Sign-out failure encountered error:", signOutErr);
        }
      }
    });
  };

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin,
        loading,
        error,
        login,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
