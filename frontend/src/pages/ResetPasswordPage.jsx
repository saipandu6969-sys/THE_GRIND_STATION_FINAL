import React, { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import api, { formatErr } from "@/lib/api";
import { toast } from "sonner";

export default function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (!token) toast.error("Reset token missing or invalid");
  }, [token]);

  const submit = async (e) => {
    e.preventDefault();
    if (password !== confirm) return toast.error("Passwords do not match");
    if (password.length < 6) return toast.error("Password must be at least 6 characters");
    setLoading(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      toast.success("Password reset. Please log in.");
      navigate("/login");
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-32 pb-24 px-5 md:px-8 min-h-screen" data-testid="reset-page">
      <div className="max-w-md mx-auto card-dark p-8">
        <p className="overline">New Password</p>
        <h1 className="heading text-4xl mt-2">Reset password</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          <input className="input-dark" type="password" placeholder="New password (min 6)" required minLength={6} value={password} onChange={e=>setPassword(e.target.value)} data-testid="reset-password" />
          <input className="input-dark" type="password" placeholder="Confirm password" required minLength={6} value={confirm} onChange={e=>setConfirm(e.target.value)} data-testid="reset-confirm" />
          <button type="submit" disabled={loading || !token} className="btn-primary w-full justify-center" data-testid="reset-submit">{loading ? "Saving…" : "Reset password"}</button>
          <p className="text-sm text-white/60 text-center"><Link to="/login" className="text-orange underline">Back to login</Link></p>
        </form>
      </div>
    </div>
  );
}
