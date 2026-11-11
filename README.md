# ClassDrop

A simple, reliable, and deliberately designed classroom file-sharing web application. Allows facilitators to distribute learning materials (PDFs, Office documents, spreadsheets, slides, ZIP archives, images) to students instantly via a public URL or QR code without requiring student accounts or sign-ins.

---

## 1. Project Architecture (Approved v4.0)

- **Frontend:** React 18, Vite, TypeScript, Tailwind CSS, React Router, Lucide Icons.
- **Backend & Auth:** Firebase Authentication (admin-only), Cloud Firestore, Cloud Storage for Firebase.
- **Cloud Functions:** Node.js 22 LTS (2nd Gen), Express gateway for short-lived (5-min) signed URL downloads and idempotent server-side deletion.
- **Hosting:** Firebase Hosting with rewrite rules mapping `/api/download/**` to Cloud Functions.

---

## 2. Getting Started & Local Development

### Prerequisites
- Node.js 20 or 22+ (LTS recommended)
- npm 10+
- Firebase CLI (`npm install -g firebase-tools` or `npx firebase-tools`)

### Setup Environment Variables
1. Copy the example configuration:
   ```bash
   cp .env.example .env
   ```
2. Populate `.env` with your Firebase project credentials from the Firebase Console (Project Settings > General > Your apps > Web app):
   ```ini
   VITE_FIREBASE_API_KEY=your_api_key
   VITE_FIREBASE_AUTH_DOMAIN=your_project.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=your_project_id
   VITE_FIREBASE_STORAGE_BUCKET=your_project.firebasestorage.app
   VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id
   VITE_FIREBASE_APP_ID=your_app_id
   ```
   *Note: If `.env` is omitted, the frontend runs in graceful foundation mode.*

---

## 3. Available Scripts

### Frontend Development
```bash
# Install frontend dependencies
npm install

# Start Vite development server (http://localhost:5173)
npm run dev

# Run TypeScript typecheck and build for production (dist/)
npm run build

# Preview production build locally
npm run preview
```

### Cloud Functions
```bash
# Navigate to functions workspace
cd functions

# Install functions dependencies
npm install

# Build functions TypeScript code (lib/)
npm run build

# Watch for TypeScript changes
npm run build:watch
```

### Firebase Emulators (Optional Local Emulation)
```bash
# Start Firebase emulators for Firestore, Storage, and Functions
firebase emulators:start
```

---

## 4. Project Directory Layout

```text
classdrop/
├── .env.example              # Environment variables template
├── .gitignore                # Git ignore rules (secrets, node_modules, build output)
├── firebase.json             # Firebase Hosting, Functions, and Rules config
├── firestore.rules           # Security rules for Cloud Firestore
├── storage.rules             # Security rules for Cloud Storage
├── index.html                # Entry HTML with Inter font
├── package.json              # Frontend dependencies and scripts
├── postcss.config.js         # PostCSS configuration for Tailwind
├── tailwind.config.js        # Design system tokens (White & Deep Blue palette)
├── tsconfig.json             # TypeScript client configuration
├── vite.config.ts            # Vite bundler configuration
├── functions/                # Cloud Functions workspace (Node.js 22 LTS)
│   ├── package.json          # Functions dependencies and scripts
│   ├── tsconfig.json         # TypeScript configuration for functions
│   └── src/
│       └── index.ts          # Functions entry point
└── src/
    ├── assets/               # Static assets
    ├── components/           # UI components
    │   ├── common/           # Reusable generic components
    │   ├── layout/           # Shared page frames and navigation
    │   ├── admin/            # Facilitator dashboard components
    │   └── student/          # Student portal components
    ├── context/              # React context providers
    ├── hooks/                # Custom React hooks
    ├── lib/                  # Shared utilities and Firebase client init
    │   └── firebase.ts       # Firebase client SDK initialization
    ├── pages/                # Route page components
    ├── types/                # Domain and database TypeScript definitions
    │   └── database.ts       # Firestore document and domain interfaces
    ├── App.tsx               # Root application component
    ├── index.css             # Tailwind base styles and design tokens
    └── main.tsx              # React DOM application mount
```

---

## 5. Visual Identity & Design System

The application strictly uses the approved human-crafted design palette:
- **Canvas White:** `#FFFFFF` (`bg-brand-white`)
- **Deep Blue (Primary Brand):** `#163A5F` (`text-brand-deep-blue`, `bg-brand-deep-blue`)
- **Royal Blue (Action Accent):** `#2563EB` (`bg-brand-royal-blue`)
- **Light Blue (Highlight):** `#EFF6FF` (`bg-brand-light-blue`)
- **Off-White (Secondary Surface):** `#F8FAFC` (`bg-brand-off-white`)
- **Dark Navy (Typography):** `#172B4D` (`text-brand-dark-navy`)
- **Slate (Secondary Text):** `#64748B` (`text-brand-slate`)
- **Border Grey (Dividers):** `#E2E8F0` (`border-brand-border`)

