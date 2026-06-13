import React, { useEffect, useRef, useState } from "react";
import api, { formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Calendar, CreditCard, Activity, QrCode, Snowflake, Flame, Wind, Download, Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Link } from "react-router-dom";
import { API_BASE } from "@/lib/api";

function fmtDate(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }); }
  catch { return iso; }
}

export default function DashboardPage() {
  const { user, setUser } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [avatarVersion, setAvatarVersion] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);

  const load = () => {
    api.get("/dashboard/me").then(r => setData(r.data)).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const cancel = async (id) => {
    try {
      await api.delete(`/classes/book/${id}`);
      toast.success("Booking cancelled");
      load();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  const downloadInvoice = async (payment_id, invoice_no) => {
    try {
      const token = localStorage.getItem("gs_token");
      const res = await fetch(`${API_BASE}/payments/${payment_id}/invoice.pdf`, {
        credentials: "include",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error("Download failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `invoice-${invoice_no || payment_id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast.error("Could not download invoice"); }
  };

  const uploadAvatar = async (file) => {
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error("Image must be under 2MB");
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) return toast.error("JPEG, PNG or WebP only");
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const { data: result } = await api.post("/me/avatar", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setAvatarVersion(v => v + 1);
      const { data: me } = await api.get("/auth/me");
      setUser(me);
      toast.success("Avatar updated");
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    try {
      await api.delete("/me/avatar");
      setAvatarVersion(v => v + 1);
      const { data: me } = await api.get("/auth/me");
      setUser(me);
      toast.success("Avatar removed");
    } catch { toast.error("Could not remove avatar"); }
  };

  if (loading) return <div className="pt-32 px-8 text-white/60">Loading dashboard…</div>;
  if (!data) return null;

  const mem = data.membership;
  const daysLeft = mem ? Math.max(0, Math.ceil((new Date(mem.expiry_date) - new Date()) / 86400000)) : 0;
  // QR data — simple member card
  const qrPayload = encodeURIComponent(JSON.stringify({ id: user.id, name: user.name, email: user.email, membership: mem?.plan_name || "—" }));
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${qrPayload}&bgcolor=141414&color=FF4500&qzone=1`;

  const facIcon = { sauna: <Flame size={16}/>, steam: <Wind size={16}/>, ice: <Snowflake size={16}/> };

  return (
    <div className="pt-28 pb-24 px-5 md:px-8" data-testid="member-dashboard">
      <div className="max-w-7xl mx-auto">
        <p className="overline">Member Dashboard</p>
        <h1 className="heading text-5xl md:text-6xl mt-3">Hello, <span className="text-orange">{user.name?.split(" ")[0] || "Member"}</span></h1>

        <div className="grid lg:grid-cols-3 gap-6 mt-10">
          {/* Digital Card */}
          <div className="card-dark p-7 lg:col-span-2 relative overflow-hidden" data-testid="member-card">
            <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full" style={{ background: "radial-gradient(circle, rgba(255,69,0,0.25), transparent 70%)" }} />
            <p className="overline">Digital Membership Card</p>
            <div className="grid md:grid-cols-[auto_1fr_auto] gap-6 mt-3 items-center">
              {/* Avatar */}
              <div className="flex flex-col items-center gap-2">
                <div className="relative group">
                  <div className="w-24 h-24 rounded-full border-2 border-orange/60 overflow-hidden bg-[#1A1A1A] flex items-center justify-center">
                    {user.avatar_url ? (
                      <img
                        src={`${API_BASE.replace('/api','')}${user.avatar_url}?v=${avatarVersion}`}
                        alt="avatar"
                        className="w-full h-full object-cover"
                        data-testid="member-avatar"
                      />
                    ) : (
                      <span className="heading text-4xl text-orange">{(user.name || "M").charAt(0).toUpperCase()}</span>
                    )}
                  </div>
                  <button
                    onClick={() => fileRef.current?.click()}
                    disabled={uploading}
                    className="absolute bottom-0 right-0 bg-orange p-1.5 rounded-full text-white hover:bg-[#FF5722] transition-colors disabled:opacity-50"
                    title="Change avatar"
                    data-testid="upload-avatar-btn"
                  >
                    <Camera size={14} />
                  </button>
                </div>
                {user.avatar_url && (
                  <button onClick={removeAvatar} className="text-[10px] uppercase tracking-widest text-white/40 hover:text-rose-400 flex items-center gap-1" data-testid="remove-avatar-btn">
                    <Trash2 size={10}/> Remove
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => uploadAvatar(e.target.files?.[0])}
                  data-testid="avatar-file-input"
                />
              </div>
              <div>
                <h3 className="heading text-3xl">{user.name}</h3>
                <p className="text-white/60 text-sm">{user.email}</p>
                <div className="mt-5 grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs uppercase tracking-widest text-white/50">Plan</div>
                    <div className="font-bold">{mem?.plan_name || "No active plan"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-white/50">Expires</div>
                    <div className="font-bold">{fmtDate(mem?.expiry_date)}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-white/50">Days Left</div>
                    <div className="font-bold text-orange">{mem ? daysLeft : "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-white/50">Extension</div>
                    <div className="font-bold">{mem?.extension_days || 0} days</div>
                  </div>
                </div>
                {!mem && <Link to="/memberships" className="btn-primary mt-6 inline-flex">Activate a membership</Link>}
              </div>
              <div className="flex flex-col items-center">
                <img src={qrUrl} alt="QR" className="rounded-lg border border-white/10" data-testid="member-qr" />
                <span className="text-[10px] uppercase tracking-widest text-white/40 mt-2 flex items-center gap-1"><QrCode size={10}/> Check-in QR</span>
              </div>
            </div>
          </div>

          {/* Recovery */}
          <div className="card-dark p-7" data-testid="recovery-usage-widget">
            <p className="overline">Recovery this month</p>
            <h3 className="heading text-2xl mt-2">{data.year_month}</h3>
            <div className="mt-4 space-y-3">
              {Object.entries(data.recovery).map(([k, v]) => (
                <div key={k}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 capitalize text-white/80">{facIcon[k]} {k} Bath</span>
                    <span className="font-bold">{v.used}<span className="text-white/40">/{v.limit}</span></span>
                  </div>
                  <div className="mt-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div className="h-full bg-orange" style={{ width: `${(v.used/v.limit)*100}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <Link to="/recovery" className="btn-secondary text-xs mt-5 inline-flex">Book session</Link>
          </div>
        </div>

        <div className="grid lg:grid-cols-2 gap-6 mt-6">
          {/* Bookings */}
          <div className="card-dark p-7" data-testid="bookings-widget">
            <div className="flex items-center justify-between">
              <p className="overline flex items-center gap-2"><Calendar size={14}/> Upcoming Bookings</p>
              <Link to="/classes" className="text-xs text-orange uppercase tracking-widest">+ New</Link>
            </div>
            {data.bookings.length === 0 ? (
              <p className="text-white/50 text-sm mt-4">No bookings yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-white/10">
                {data.bookings.slice(0,8).map((b) => (
                  <li key={b.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-bold">{b.class_name}</div>
                      <div className="text-xs text-white/50">{b.session_date} · <span className={b.status==="confirmed"?"text-emerald-400":"text-amber-400"}>{b.status}</span></div>
                    </div>
                    <button onClick={() => cancel(b.id)} className="text-xs text-white/50 hover:text-rose-400 uppercase tracking-widest" data-testid={`cancel-booking-${b.id}`}>Cancel</button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Payments */}
          <div className="card-dark p-7" data-testid="payments-widget">
            <p className="overline flex items-center gap-2"><CreditCard size={14}/> Payment History</p>
            {data.payments.length === 0 ? (
              <p className="text-white/50 text-sm mt-4">No payments yet.</p>
            ) : (
              <ul className="mt-4 divide-y divide-white/10">
                {data.payments.slice(0,8).map((p) => (
                  <li key={p.id} className="py-3 flex items-center justify-between">
                    <div>
                      <div className="font-bold">{p.plan_name}</div>
                      <div className="text-xs text-white/50">{p.invoice_no} · {fmtDate(p.created_at)} · {p.method.replace("_"," ")}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">₹{p.amount.toLocaleString("en-IN")}</div>
                      <button onClick={()=>downloadInvoice(p.id, p.invoice_no)} className="text-[10px] uppercase tracking-widest text-orange flex items-center gap-1 hover:underline" data-testid={`download-invoice-${p.id}`}><Download size={10}/> Invoice</button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
