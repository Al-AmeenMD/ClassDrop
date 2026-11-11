import React from "react";
import { Routes, Route } from "react-router-dom";

export const App: React.FC = () => {
  return (
    <Routes>
      <Route
        path="/"
        element={<div className="min-h-screen bg-brand-white text-brand-dark-navy" />}
      />
    </Routes>
  );
};

export default App;
