# ClassDrop: Administrator Provisioning Guide

## Overview

ClassDrop intentionally does not provide public registration, sign-up forms, or frontend user creation endpoints. 

To maintain security, administrative privileges are established strictly via the **Authoritative Admin Registry** in Cloud Firestore (`/admins/{uid}`). An authenticated Firebase user is granted administrative access if and only if their unique Firebase Authentication UID exists as a document ID in `/admins/{uid}`.

---

## Step-by-Step Initial Administrator Provisioning

Follow these steps using the official **Firebase Console** (or the Firebase CLI / Admin SDK in a secure environment):

### Step 1: Create the User in Firebase Authentication
1. Open the [Firebase Console](https://console.firebase.google.com/).
2. Select your ClassDrop project.
3. In the left navigation menu, go to **Build** > **Authentication**.
4. If not already enabled, click **Get Started** and enable the **Email/Password** sign-in provider (leave "Email link" disabled).
5. In the **Users** tab, click **Add user**.
6. Enter the facilitator's email address (e.g., `facilitator@school.edu`) and generate a strong password.
7. Click **Add user**.
8. In the users table, locate the newly created user and **copy their User UID** (a 28-character alphanumeric string, e.g. `J8kL9mN0pQ1rS2tU3vW4xY5zA6b`).

---

### Step 2: Register the Administrator in Cloud Firestore
1. In the left navigation menu, go to **Build** > **Firestore Database**.
2. Click **Start collection** (or navigate to the existing collection).
3. Set the **Collection ID** to:
   ```text
   admins
   ```
4. For the **Document ID**, paste the **exact User UID** copied in Step 1 (do NOT use an auto-generated ID):
   ```text
   [PASTE_USER_UID_HERE]
   ```
5. Add the following fields to the document:
   - Field: `email` | Type: `string` | Value: `facilitator@school.edu`
   - Field: `role` | Type: `string` | Value: `admin`
   - Field: `authorizedAt` | Type: `timestamp` | Value: Current date and time
6. Click **Save**.

---

### Step 3: Verify Administrator Sign-In
1. Navigate to the ClassDrop web application:
   - Locally: `http://localhost:5173/login`
   - Production: `https://[your-project-id].web.app/login`
2. Enter the facilitator's email address and password.
3. Click **Sign In to Administration**.
4. The application will authenticate with Firebase Auth, query `/admins/{uid}`, verify the document exists, and grant access to the protected administration area (`/admin`).

---

## Security Verification & Revocation Workflow

### What happens if an unauthorized user creates an account?
If a user account exists in Firebase Authentication but does not have a corresponding document in `/admins/{uid}`:
- The application's `AuthContext` receives the authentication event and attaches a listener to `/admins/{uid}`.
- Because the document does not exist, the live listener immediately rejects the user (`snapshot.exists() === false`).
- Administrative privileges are refused (`isAdmin = false`), the session is terminated via `firebaseSignOut(auth)`, and `loading` is set to `false`.
- A clear user-facing error message is displayed: *"Access denied: Your account is not registered in the administrator registry."*
- Protected administrative routes (`/admin/*`) are blocked by `ProtectedRoute` and redirect to `/login`.

---

### Administrator Revocation Workflow & Multi-Tier Scope

To revoke an administrator's privileges, simply delete their document from the `/admins` collection in Firestore:
1. Open the Firestore Database in the [Firebase Console](https://console.firebase.google.com/).
2. Navigate to the `/admins` collection.
3. Locate the document matching the administrator's UID.
4. Click the options menu and select **Delete document**.

When the administrator document is deleted, access is revoked across three distinct scopes:

#### Scope 1: Backend Firestore & Cloud Storage Operations (Instantaneous)
- Every incoming read and write request to `/resources/{id}` or Cloud Storage is evaluated in real time by Firebase Security Rules.
- The rules evaluate `exists(/databases/$(database)/documents/admins/$(request.auth.uid))` dynamically on every single operation.
- **Effect:** The very next time the revoked user attempts any administrative operation (e.g., uploading files, drafting resources, publishing, or deleting resources), the rule evaluation fails immediately and returns `PERMISSION_DENIED` with zero delay.

#### Scope 2: Active Frontend Browser Session (Instantaneous via Live Listener)
- The ClassDrop frontend maintains a live Firestore `onSnapshot()` listener on `/admins/{uid}` for the duration of an authenticated session.
- Deletion of the administrator document triggers the `onSnapshot` callback in real time without requiring a manual page refresh, token refresh, or re-authentication.
- **Effect:** The snapshot listener detects `snapshot.exists() === false`, immediately clears administrative state (`isAdmin = false`, `user = null`), triggers `firebaseSignOut(auth)`, and sets a clear error message. `ProtectedRoute` immediately detects the state change and redirects the browser back to `/login`.

#### Scope 3: Previously Generated Signed URLs (Cryptographic Expiration)
- In the ClassDrop architecture, temporary signed URLs are issued for secure downloads and uploads with a strict 5-minute maximum lifetime.
- Signed URLs are cryptographically signed using Google Cloud Storage private keys. Once generated and signed, an existing URL remains valid at the Cloud Storage edge until its cryptographic expiration timestamp arrives (up to 5 minutes maximum).
- **Effect:** Deleting the administrator document in Firestore immediately prevents the user from requesting or generating any **new** signed URLs (because Cloud Functions and security rules reject unverified callers). Any previously generated signed URLs will naturally expire within their 5-minute cryptographic window. Cloud Functions download-token transactions also independently verify caller permissions before issuing any tokens.

---

## Cloud Storage Cross-Service IAM Requirement

Cloud Storage Security Rules verify administrator status by querying Firestore using `firestore.exists(...)`. For this rule evaluation to succeed in Google Cloud, the Cloud Storage Service Agent requires the **Firebase Rules Firestore Service Agent** role:

```bash
# 1. Obtain your Project Number
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")

# 2. Grant the required cross-service role
gcloud projects add-iam-policy-binding YOUR_PROJECT_ID \
  --member="serviceAccount:service-${PROJECT_NUMBER}@gcp-sa-firebasestorage.iam.gserviceaccount.com" \
  --role="roles/firebaserules.firestoreServiceAgent"

# 3. Verify the role binding
gcloud projects get-iam-policy YOUR_PROJECT_ID \
  --flatten="bindings[].members" \
  --format="table(bindings.role)" \
  --filter="bindings.members:service-${PROJECT_NUMBER}@gcp-sa-firebasestorage.iam.gserviceaccount.com"
```
*(Note: Do not run or claim this command has succeeded until live Firebase project credentials are provided by the project owner).*

