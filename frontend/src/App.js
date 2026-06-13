import React from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Toaster } from "sonner";
import "@/App.css";

import { AuthProvider } from "@/context/AuthContext";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import WhatsAppButton from "@/components/WhatsAppButton";
import ProtectedRoute from "@/components/ProtectedRoute";

import HomePage from "@/pages/HomePage";
import MembershipsPage from "@/pages/MembershipsPage";
import ClassesPage from "@/pages/ClassesPage";
import RecoveryPage from "@/pages/RecoveryPage";
import ContactPage from "@/pages/ContactPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import ResetPasswordPage from "@/pages/ResetPasswordPage";
import DashboardPage from "@/pages/DashboardPage";
import AdminDashboard from "@/pages/AdminDashboard";

export default function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <AuthProvider>
          <Navbar />
          <main className="min-h-screen">
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/memberships" element={<MembershipsPage />} />
              <Route path="/classes" element={<ClassesPage />} />
              <Route path="/recovery" element={<RecoveryPage />} />
              <Route path="/contact" element={<ContactPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/forgot-password" element={<ForgotPasswordPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute requireAdmin><AdminDashboard /></ProtectedRoute>} />
            </Routes>
          </main>
          <Footer />
          <WhatsAppButton />
          <Toaster theme="dark" position="top-right" toastOptions={{ style: { background: "#1A1A1A", border: "1px solid #2A2A2A", color: "#fff" } }} />
        </AuthProvider>
      </BrowserRouter>
    </div>
  );
}
