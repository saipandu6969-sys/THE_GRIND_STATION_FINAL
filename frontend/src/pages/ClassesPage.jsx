import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Clock, Users, Zap, Calendar, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const diffColor = { Beginner: "text-emerald-400", Intermediate: "text-amber-400", Advanced: "text-rose-400" };
const DAYS = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];

function ymd(d) { return d.toISOString().slice(0,10); }
function fmtDay(d) { return d.toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short" }); }

export default function ClassesPage() {
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDateIndex, setSelectedDateIndex] = useState(0); // 0..3 (today..+3)
  const [view, setView] = useState("calendar"); // calendar | list
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    api.get("/classes").then(r => setClasses(r.data)).finally(() => setLoading(false));
  }, []);

  // build 4 dates: today + next 3
  const dates = useMemo(() => {
    const today = new Date();
    return [0,1,2,3].map(d => {
      const dt = new Date(today);
      dt.setDate(today.getDate() + d);
      return dt;
    });
  }, []);

  const selectedDate = dates[selectedDateIndex];
  const selectedDay = DAYS[selectedDate.getDay()];
  const dayClasses = useMemo(() => classes.filter(c => c.day_of_week === selectedDay), [classes, selectedDay]);

  const book = async (cls) => {
    if (!user) { navigate("/login", { state: { from: "/classes" } }); return; }
    try {
      const { data } = await api.post("/classes/book", { class_id: cls.id, session_date: ymd(selectedDate) });
      if (data.status === "confirmed") toast.success(`Booked ${cls.name} · ${fmtDay(selectedDate)}`);
      else toast.info(`Added to waitlist for ${cls.name}`);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Booking failed");
    }
  };

  return (
    <div className="pt-28 pb-24 px-5 md:px-8" data-testid="classes-page">
      <div className="max-w-7xl mx-auto">
        <p className="overline">Group Classes</p>
        <h1 className="heading text-5xl md:text-7xl mt-4">Pick a fight. <span className="text-orange">Show up.</span></h1>
        <p className="text-white/70 mt-6 max-w-2xl">Members can reserve any class up to <span className="text-orange font-bold">3 days in advance</span>. If a session is full, you'll be added to the waitlist automatically.</p>

        {/* View Toggle */}
        <div className="mt-10 flex items-center justify-between flex-wrap gap-4">
          <div className="flex border border-white/10" data-testid="view-toggle">
            <button onClick={() => setView("calendar")} className={`px-4 py-2 text-xs uppercase tracking-widest font-bold ${view==="calendar"?"bg-orange text-white":"text-white/70"}`} data-testid="view-calendar">Calendar</button>
            <button onClick={() => setView("list")} className={`px-4 py-2 text-xs uppercase tracking-widest font-bold ${view==="list"?"bg-orange text-white":"text-white/70"}`} data-testid="view-list">All Classes</button>
          </div>
        </div>

        {view === "calendar" ? (
          <>
            {/* Date pills */}
            <div className="mt-6 grid grid-cols-2 md:grid-cols-4 gap-3" data-testid="date-pills">
              {dates.map((d, i) => {
                const active = i === selectedDateIndex;
                return (
                  <button key={i} onClick={() => setSelectedDateIndex(i)}
                    className={`p-4 text-left border transition-all ${active ? "border-orange bg-orange/10" : "border-white/10 hover:border-white/30"}`}
                    data-testid={`date-pill-${i}`}>
                    <div className={`text-xs uppercase tracking-widest ${active?"text-orange":"text-white/50"}`}>{i===0?"Today":i===1?"Tomorrow":fmtDay(d).split(",")[0]}</div>
                    <div className="heading text-2xl mt-1">{d.getDate()} <span className="text-white/40">{d.toLocaleDateString("en-IN",{month:"short"})}</span></div>
                  </button>
                );
              })}
            </div>

            {/* Classes for that day */}
            <div className="mt-8">
              {loading ? (
                <div className="text-white/50">Loading…</div>
              ) : dayClasses.length === 0 ? (
                <div className="card-dark p-7 text-white/60" data-testid="no-classes">
                  No classes scheduled on {fmtDay(selectedDate)}. Try another day.
                </div>
              ) : (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {dayClasses.map((c) => (
                    <ClassCard key={c.id} c={c} onBook={() => book(c)} date={selectedDate} />
                  ))}
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6 mt-8">
            {classes.map((c) => <ClassCard key={c.id} c={c} onBook={() => { setView("calendar"); /* fallback - book on next matching */ const idx = dates.findIndex(d => DAYS[d.getDay()] === c.day_of_week); if (idx >= 0) { setSelectedDateIndex(idx); } else { toast.info(`Next ${c.name} is outside the 3-day booking window`); } }} listMode />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ClassCard({ c, onBook, date, listMode }) {
  return (
    <div className="card-dark overflow-hidden" data-testid={`class-card-${c.id}`}>
      {c.image_url && <img src={c.image_url} alt={c.name} className="w-full h-44 object-cover" />}
      <div className="p-6">
        <div className="flex items-center justify-between">
          <h3 className="heading text-2xl">{c.name}</h3>
          <span className={`text-xs uppercase tracking-widest font-bold ${diffColor[c.difficulty] || "text-white"}`}>{c.difficulty}</span>
        </div>
        <p className="text-sm text-white/60 mt-2">{c.description}</p>
        <div className="mt-4 grid grid-cols-2 gap-3 text-xs text-white/70">
          <div className="flex items-center gap-2"><Calendar size={14} className="text-orange"/> {c.day_of_week} · {c.start_time}</div>
          <div className="flex items-center gap-2"><Clock size={14} className="text-orange"/> {c.duration_minutes} min</div>
          <div className="flex items-center gap-2"><Users size={14} className="text-orange"/> {c.capacity} seats</div>
          <div className="flex items-center gap-2"><Zap size={14} className="text-orange"/> {c.trainer}</div>
        </div>
        <button onClick={onBook} className="btn-primary w-full mt-5 justify-center" data-testid={`book-class-${c.id}`}>
          {listMode ? "View Slots" : `Reserve · ${date.toLocaleDateString("en-IN",{day:"2-digit",month:"short"})}`}
        </button>
      </div>
    </div>
  );
}
