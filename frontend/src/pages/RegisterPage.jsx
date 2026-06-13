import React, { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth, formatErr } from "@/context/AuthContext";
import { toast } from "sonner";

export default function RegisterPage() {
  const [form, setForm] = useState({ name: "", email: "", mobile: "", password: "" });
  const [loading, setLoading] = useState(false);
  const { register } = useAuth();
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await register(form);
      toast.success(`Welcome to Grind Station, ${u.name}`);
      navigate("/memberships");
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail) || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-32 pb-24 px-5 md:px-8 min-h-screen" data-testid="register-page">
      <div className="max-w-md mx-auto card-dark p-8">
        <p className="overline">Join the grind</p>
        <h1 className="heading text-4xl mt-2">Create account</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input className="input-dark" placeholder="Full name" required value={form.name} onChange={e=>setForm({...form, name: e.target.value})} data-testid="register-name" />
          <input className="input-dark" type="email" placeholder="Email" required value={form.email} onChange={e=>setForm({...form, email: e.target.value})} data-testid="register-email" />
          <input className="input-dark" placeholder="Mobile number" required value={form.mobile} onChange={e=>setForm({...form, mobile: e.target.value})} data-testid="register-mobile" />
          <input className="input-dark" type="password" placeholder="Password (min 6 chars)" required minLength={6} value={form.password} onChange={e=>setForm({...form, password: e.target.value})} data-testid="register-password" />
          <button type="submit" disabled={loading} className="btn-primary w-full justify-center" data-testid="register-submit">{loading ? "Creating…" : "Create Account"}</button>
        </form>
        <p className="text-sm text-white/60 mt-6 text-center">
          Already a member? <Link to="/login" className="text-orange underline">Log in</Link>
        </p>
      </div>
    </div>
  );
}
