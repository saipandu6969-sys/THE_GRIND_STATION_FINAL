import React, { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth, formatErr } from "@/context/AuthContext";
import { toast } from "sonner";

export default function LoginPage() {
  const [form, setForm] = useState({ email: "", password: "" });
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || "/dashboard";

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(form.email, form.password);
      toast.success(`Welcome back, ${u.name}`);
      navigate(u.role === "admin" ? "/admin" : from);
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail) || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-32 pb-24 px-5 md:px-8 min-h-screen" data-testid="login-page">
      <div className="max-w-md mx-auto card-dark p-8">
        <p className="overline">Welcome back</p>
        <h1 className="heading text-4xl mt-2">Log in</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input className="input-dark" type="email" placeholder="Email" required value={form.email} onChange={e=>setForm({...form, email: e.target.value})} data-testid="login-email" />
          <input className="input-dark" type="password" placeholder="Password" required value={form.password} onChange={e=>setForm({...form, password: e.target.value})} data-testid="login-password" />
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center" data-testid="login-submit">{loading ? "Signing in…" : "Sign In"}</button>
        </form>
        <div className="mt-4 text-center">
          <Link to="/forgot-password" className="text-xs uppercase tracking-widest text-white/60 hover:text-orange" data-testid="forgot-link">Forgot password?</Link>
        </div>
        <p className="text-sm text-white/60 mt-6 text-center">
          New to Grind Station? <Link to="/register" className="text-orange underline">Create an account</Link>
        </p>
      </div>
    </div>
  );
}
