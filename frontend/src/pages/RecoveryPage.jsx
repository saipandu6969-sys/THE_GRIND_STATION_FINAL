import React, { useEffect, useState } from "react";
import api, { formatErr } from "@/lib/api";
import { Flame, Wind, Snowflake } from "lucide-react";
import { toast } from "sonner";

const FACILITIES = [
  { key: "sauna", name: "Sauna Bath", desc: "Dry heat 80–95°C", icon: <Flame /> },
  { key: "steam", name: "Steam Bath", desc: "Wet heat · 100% humidity", icon: <Wind /> },
  { key: "ice", name: "Ice Bath", desc: "Cold plunge · 3–5°C", icon: <Snowflake /> },
];

export default function RecoveryPage() {
  const [usage, setUsage] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = () => {
    api.get("/recovery/usage")
      .then(r => setUsage(r.data))
      .catch(() => setUsage(null))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const book = async (key) => {
    try {
      const today = new Date().toISOString().slice(0,10);
      await api.post("/recovery/book", { facility: key, session_date: today });
      toast.success(`Booked ${key} bath`);
      load();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Booking failed");
    }
  };

  return (
    <div className="pt-28 pb-24 px-5 md:px-8" data-testid="recovery-page">
      <div className="max-w-5xl mx-auto">
        <p className="overline">Recovery Zone</p>
        <h1 className="heading text-5xl md:text-7xl mt-4">Reset. <span className="text-orange">Reload.</span></h1>
        <p className="text-white/70 mt-6 max-w-2xl">Every member can use each recovery facility up to 2 times per month. Limits reset on the 1st of every month.</p>

        {loading ? (
          <div className="text-white/50 mt-12">Loading…</div>
        ) : !usage ? (
          <div className="card-dark p-7 mt-12 text-white/70">
            Please <a href="/login" className="text-orange underline">login</a> to view and book recovery sessions. An active membership is required.
          </div>
        ) : (
          <div className="grid md:grid-cols-3 gap-5 mt-12">
            {FACILITIES.map((f) => {
              const u = usage.facilities[f.key];
              const disabled = u.remaining <= 0;
              return (
                <div key={f.key} className="card-dark p-7" data-testid={`recovery-${f.key}-card`}>
                  <div className="text-orange">{f.icon}</div>
                  <h3 className="heading text-2xl mt-4">{f.name}</h3>
                  <p className="text-sm text-white/60">{f.desc}</p>
                  <div className="mt-6 pb-4 border-b border-white/10">
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs uppercase tracking-widest text-white/50">Used</span>
                      <span className="heading text-3xl text-orange">{u.used}<span className="text-white/40">/{u.limit}</span></span>
                    </div>
                    <div className="mt-3 h-2 bg-white/10 rounded-full overflow-hidden">
                      <div className="h-full bg-orange transition-all" style={{ width: `${(u.used/u.limit)*100}%` }} />
                    </div>
                    <div className="mt-2 text-xs text-white/50">Remaining: {u.remaining}</div>
                  </div>
                  <button
                    disabled={disabled}
                    onClick={() => book(f.key)}
                    className={disabled ? "btn-secondary w-full mt-5 justify-center opacity-40 cursor-not-allowed" : "btn-primary w-full mt-5 justify-center"}
                    data-testid={`book-recovery-${f.key}`}
                  >
                    {disabled ? "Limit Reached" : "Book Session"}
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
