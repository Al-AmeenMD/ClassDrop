import React from "react";
import { isFirebaseConfigured } from "./lib/firebase";

export const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-brand-white flex flex-col justify-between">
      {/* Header */}
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
          <span className="text-xs font-medium text-brand-slate bg-brand-off-white border border-brand-border px-2.5 py-1 rounded">
            Foundation v1.0
          </span>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-12">
        <div className="border border-brand-border rounded-md p-8 bg-brand-white">
          <h1 className="text-xl font-semibold text-brand-dark-navy mb-2">
            ClassDrop Project Foundation
          </h1>
          <p className="text-sm text-brand-slate mb-6">
            A simple, reliable classroom file-sharing application designed for fast distribution of learning materials.
          </p>

          <div className="border-t border-brand-border pt-6">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-brand-slate mb-3">
              Environment & Foundation Status
            </h2>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between py-2 px-3 rounded bg-brand-off-white border border-brand-border">
                <span className="text-brand-dark-navy font-medium">Frontend Core</span>
                <span className="text-xs font-medium text-brand-royal-blue bg-brand-light-blue px-2 py-0.5 rounded">
                  React 18 + Vite + TypeScript + Tailwind CSS
                </span>
              </div>
              <div className="flex items-center justify-between py-2 px-3 rounded bg-brand-off-white border border-brand-border">
                <span className="text-brand-dark-navy font-medium">Firebase Client SDK</span>
                <span className="text-xs font-medium text-brand-slate">
                  {isFirebaseConfigured ? "Configuration Active" : "Pending Environment Config (.env)"}
                </span>
              </div>
              <div className="flex items-center justify-between py-2 px-3 rounded bg-brand-off-white border border-brand-border">
                <span className="text-brand-dark-navy font-medium">Design Tokens</span>
                <span className="text-xs font-medium text-brand-deep-blue">
                  White & Deep Blue System Configured
                </span>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-brand-border bg-brand-off-white px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-xs text-brand-slate">
          <span>ClassDrop Classroom Utility</span>
          <span>Phase 1: Project Foundation</span>
        </div>
      </footer>
    </div>
  );
};

export default App;

