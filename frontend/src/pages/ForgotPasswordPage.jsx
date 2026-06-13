import React, { useState } from "react";
import { Link } from "react-router-dom";
import api, { formatErr } from "@/lib/api";
import { toast } from "sonner";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [devToken, setDevToken] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await api.post("/auth/forgot-password", { email });
      setSent(true);
      if (data.dev_token) setDevToken(data.dev_token);
      toast.success("If that email exists, we sent a reset link.");
    } catch (err) {
      toast.error(formatErr(err.response?.data?.detail));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="pt-32 pb-24 px-5 md:px-8 min-h-screen" data-testid="forgot-page">
      <div className="max-w-md mx-auto card-dark p-8">
        <p className="overline">Reset Password</p>
        <h1 className="heading text-4xl mt-2">Forgot password?</h1>
        {sent ? (
          <div className="mt-6 space-y-4">
            <p className="text-white/70 text-sm">Check your email for a reset link. It's valid for 1 hour.</p>
            {devToken && (
              <div className="card-dark p-4 border-orange/40">
                <p className="text-[10px] uppercase tracking-widest text-orange">Dev mode</p>
                <p className="text-xs text-white/60 mt-1">No email service configured. Use this link:</p>
                <Link to={`/reset-password?token=${devToken}`} className="text-orange text-xs underline break-all mt-2 inline-block">
                  /reset-password?token={devToken.slice(0,20)}…
                </Link>
              </div>
            )}
            <Link to="/login" className="btn-secondary w-full justify-center">Back to login</Link>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            <p className="text-white/60 text-sm">Enter your email and we'll send you a reset link.</p>
            <input className="input-dark" type="email" placeholder="Email" required value={email} onChange={e=>setEmail(e.target.value)} data-testid="forgot-email" />
            <button type="submit" disabled={loading} className="btn-primary w-full justify-center" data-testid="forgot-submit">{loading ? "Sending…" : "Send Reset Link"}</button>
            <p className="text-sm text-white/60 text-center"><Link to="/login" className="text-orange underline">Back to login</Link></p>
          </form>
        )}
      </div>
    </div>
  );
}
