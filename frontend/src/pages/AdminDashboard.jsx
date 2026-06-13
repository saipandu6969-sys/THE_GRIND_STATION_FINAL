import React, { useEffect, useState } from "react";
import api, { formatErr } from "@/lib/api";
import { Users, CreditCard, TrendingUp, Activity, RotateCcw, Edit2, Trash2, Plus, X, UserMinus } from "lucide-react";
import { toast } from "sonner";

function Tab({ active, onClick, children, id }) {
  return (
    <button onClick={onClick} data-testid={`admin-tab-${id}`}
      className={`px-5 py-3 text-xs uppercase tracking-widest font-bold transition-colors border-b-2 ${active ? "border-orange text-orange" : "border-transparent text-white/60 hover:text-white"}`}>
      {children}
    </button>
  );
}

const EMPTY_CLASS = {
  name: "", description: "", trainer: "", day_of_week: "Mon", start_time: "06:00",
  duration_minutes: 60, difficulty: "Beginner", capacity: 10, image_url: "",
};

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DIFFICULTIES = ["Beginner", "Intermediate", "Advanced"];

const NEW_NAME_OPTION = "__new__";

function ClassForm({ initial, onSave, onCancel, saving, existingClasses }) {
  const [form, setForm] = useState(initial);
  const [nameMode, setNameMode] = useState(() => {
    if (initial.id) return "select";
    return existingClasses.length > 0 ? "select" : "type";
  });

  const update = (k, v) => setForm({ ...form, [k]: v });

  const submit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  const uniqueByName = [];
  const seen = new Set();
  for (const c of existingClasses) {
    if (!seen.has(c.name)) { seen.add(c.name); uniqueByName.push(c); }
  }

  const handleNameSelect = (value) => {
    if (value === NEW_NAME_OPTION) {
      setNameMode("type");
      update("name", "");
      return;
    }
    const picked = existingClasses.find(c => c.name === value);
    if (picked) {
      const { id, created_at, active, ...rest } = picked;
      setForm({ ...form, ...rest, name: picked.name });
    }
  };

  return (
    <form onSubmit={submit} className="card-dark p-5 space-y-3" data-testid="class-form">
      <div className="flex items-center justify-between">
        <h3 className="heading text-lg">{initial.id ? "Edit Class" : "New Class"}</h3>
        <button type="button" onClick={onCancel} className="text-white/60 hover:text-white" data-testid="class-form-cancel">
          <X size={18} />
        </button>
      </div>

      <div>
        <label className="text-xs uppercase tracking-widest text-white/50 mb-1 block">Class Name</label>
        {nameMode === "select" ? (
          <select className="input-dark" value={form.name || NEW_NAME_OPTION} onChange={e => handleNameSelect(e.target.value)}
            data-testid="class-form-name-select">
            <option value={NEW_NAME_OPTION}>+ Add New Class Name</option>
            {uniqueByName.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
        ) : (
          <input className="input-dark" placeholder="Class Name" required autoFocus
            value={form.name} onChange={e => update("name", e.target.value)}
            data-testid="class-form-name" />
        )}
        {nameMode === "type" && uniqueByName.length > 0 && (
          <button type="button" onClick={() => setNameMode("select")}
            className="text-xs text-white/50 hover:text-orange mt-1 underline">
            Choose from existing classes instead
          </button>
        )}
      </div>

      <textarea className="input-dark" placeholder="Description" required rows={2}
        value={form.description} onChange={e => update("description", e.target.value)}
        data-testid="class-form-description" />

      <input className="input-dark" placeholder="Trainer Name" required
        value={form.trainer} onChange={e => update("trainer", e.target.value)}
        data-testid="class-form-trainer" />

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs uppercase tracking-widest text-white/50 mb-1 block">Day of Week</label>
          <select className="input-dark" value={form.day_of_week} onChange={e => update("day_of_week", e.target.value)}
            data-testid="class-form-day">
            {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-white/50 mb-1 block">Start Time</label>
          <input type="time" className="input-dark" required
            value={form.start_time} onChange={e => update("start_time", e.target.value)}
            data-testid="class-form-time" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs uppercase tracking-widest text-white/50 mb-1 block">Duration (minutes)</label>
          <input type="number" className="input-dark" required min={5}
            value={form.duration_minutes} onChange={e => update("duration_minutes", Number(e.target.value))}
            data-testid="class-form-duration" />
        </div>
        <div>
          <label className="text-xs uppercase tracking-widest text-white/50 mb-1 block">Capacity</label>
          <input type="number" className="input-dark" required min={1}
            value={form.capacity} onChange={e => update("capacity", Number(e.target.value))}
            data-testid="class-form-capacity" />
        </div>
      </div>

      <div>
        <label className="text-xs uppercase tracking-widest text-white/50 mb-1 block">Difficulty</label>
        <select className="input-dark" value={form.difficulty} onChange={e => update("difficulty", e.target.value)}
          data-testid="class-form-difficulty">
          {DIFFICULTIES.map(d => <option key={d} value={d}>{d}</option>)}
        </select>
      </div>

      <input className="input-dark" placeholder="Image URL (optional)"
        value={form.image_url || ""} onChange={e => update("image_url", e.target.value)}
        data-testid="class-form-image" />

      <div className="flex gap-3 pt-2">
        <button type="submit" disabled={saving} className="btn-primary flex-1 justify-center" data-testid="class-form-submit">
          {saving ? "Saving…" : "Save Class"}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary flex-1 justify-center">
          Cancel
        </button>
      </div>
    </form>
  );
}

export default function AdminDashboard() {
  const [tab, setTab] = useState("overview");
  const [analytics, setAnalytics] = useState(null);
  const [users, setUsers] = useState([]);
  const [plans, setPlans] = useState([]);
  const [classes, setClasses] = useState([]);
  const [payments, setPayments] = useState([]);
  const [recovery, setRecovery] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [removingTrainer, setRemovingTrainer] = useState(null);

  // Class editing state
  const [editingClass, setEditingClass] = useState(null);
  const [savingClass, setSavingClass] = useState(false);

  const loadAll = async () => {
    try {
      const [a, u, p, c, pay, r, b] = await Promise.all([
        api.get("/admin/analytics"),
        api.get("/admin/users"),
        api.get("/plans?all_plans=true"),
        api.get("/classes"),
        api.get("/admin/payments"),
        api.get("/admin/recovery"),
        api.get("/admin/bookings"),
      ]);
      setAnalytics(a.data); setUsers(u.data); setPlans(p.data); setClasses(c.data);
      setPayments(pay.data); setRecovery(r.data); setBookings(b.data);
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to load");
    }
  };
  useEffect(() => { loadAll(); }, []);

  const updatePlanDiscount = async (id, v) => {
    try {
      await api.put(`/plans/${id}`, { discount_percent: Number(v) });
      toast.success("Discount updated");
      loadAll();
    } catch (e) { toast.error(formatErr(e.response?.data?.detail)); }
  };

  const togglePlan = async (id, active) => {
    await api.put(`/plans/${id}`, { active: !active });
    loadAll();
  };

  const resetRecovery = async () => {
    if (!window.confirm("Reset all members' recovery usage for this month?")) return;
    await api.post("/admin/recovery/reset");
    toast.success("Recovery usage reset");
    loadAll();
  };

  // ---- Class CRUD ----
  const saveClass = async (form) => {
    setSavingClass(true);
    try {
      if (form.id) {
        const { id, created_at, active, ...updates } = form;
        await api.put(`/classes/${id}`, updates);
        toast.success("Class updated");
      } else {
        await api.post("/classes", form);
        toast.success("Class created");
      }
      setEditingClass(null);
      loadAll();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to save class");
    } finally {
      setSavingClass(false);
    }
  };

  const deleteClass = async (id, name) => {
    if (!window.confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try {
      await api.delete(`/classes/${id}`);
      toast.success("Class deleted");
      loadAll();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to delete class");
    }
  };

  // ---- Trainer removal ----
  const removeTrainer = async (trainerName) => {
    if (!window.confirm(`Remove "${trainerName}" from all classes? Their classes will be set to "TBA".`)) return;
    setRemovingTrainer(trainerName);
    try {
      const trainerClasses = classes.filter(c => c.trainer === trainerName);
      await Promise.all(
        trainerClasses.map(c => {
          const { id, created_at, active, ...rest } = c;
          return api.put(`/classes/${id}`, { ...rest, trainer: "TBA" });
        })
      );
      toast.success(`${trainerName} removed. ${trainerClasses.length} class(es) set to TBA.`);
      loadAll();
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail) || "Failed to remove trainer");
    } finally {
      setRemovingTrainer(null);
    }
  };

  // Derive unique trainers from classes
  const uniqueTrainers = [...new Set(classes.map(c => c.trainer).filter(t => t && t !== "TBA"))];

  return (
    <div className="pt-28 pb-24 px-5 md:px-8" data-testid="admin-dashboard">
      <div className="max-w-7xl mx-auto">
        <p className="overline">Admin</p>
        <h1 className="heading text-5xl md:text-6xl mt-3">Control <span className="text-orange">Room.</span></h1>

        <div className="mt-8 border-b border-white/10 flex flex-wrap">
          <Tab id="overview" active={tab==="overview"} onClick={()=>setTab("overview")}>Overview</Tab>
          <Tab id="plans" active={tab==="plans"} onClick={()=>setTab("plans")}>Plans</Tab>
          <Tab id="users" active={tab==="users"} onClick={()=>setTab("users")}>Members</Tab>
          <Tab id="classes" active={tab==="classes"} onClick={()=>setTab("classes")}>Classes</Tab>
          <Tab id="trainers" active={tab==="trainers"} onClick={()=>setTab("trainers")}>Trainers</Tab>
          <Tab id="payments" active={tab==="payments"} onClick={()=>setTab("payments")}>Payments</Tab>
          <Tab id="recovery" active={tab==="recovery"} onClick={()=>setTab("recovery")}>Recovery</Tab>
        </div>

        {tab === "overview" && analytics && (
          <div className="mt-10">
            <div className="grid md:grid-cols-4 gap-5">
              {[
                {t:"Members", v: analytics.total_users, i:<Users/>},
                {t:"Active", v: analytics.active_members, i:<Activity/>},
                {t:"Revenue", v: `₹${Math.round(analytics.revenue).toLocaleString("en-IN")}`, i:<TrendingUp/>},
                {t:"Transactions", v: analytics.total_payments, i:<CreditCard/>},
              ].map((s, i) => (
                <div key={i} className="card-dark p-6" data-testid={`stat-${s.t.toLowerCase()}`}>
                  <div className="flex items-center justify-between text-white/50">
                    <span className="text-xs uppercase tracking-widest">{s.t}</span>
                    <span className="text-orange">{s.i}</span>
                  </div>
                  <div className="heading text-4xl mt-3">{s.v}</div>
                </div>
              ))}
            </div>
            <div className="grid md:grid-cols-2 gap-5 mt-6">
              <div className="card-dark p-6">
                <p className="overline">Plan Sales</p>
                <ul className="mt-4 space-y-2">
                  {analytics.plan_sales.map((p, i) => (
                    <li key={i} className="flex items-center justify-between text-sm border-b border-white/10 pb-2">
                      <span>{p.plan}</span>
                      <span className="text-white/60">{p.count} sold · <span className="text-orange font-bold">₹{Math.round(p.revenue).toLocaleString("en-IN")}</span></span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="card-dark p-6">
                <p className="overline">Most Booked Classes</p>
                <ul className="mt-4 space-y-2">
                  {analytics.most_booked_classes.map((c, i) => (
                    <li key={i} className="flex items-center justify-between text-sm border-b border-white/10 pb-2">
                      <span>{c.name}</span>
                      <span className="text-orange font-bold">{c.count}</span>
                    </li>
                  ))}
                  {analytics.most_booked_classes.length === 0 && <li className="text-white/50 text-sm">No bookings yet.</li>}
                </ul>
              </div>
            </div>
          </div>
        )}

        {tab === "plans" && (
          <div className="mt-10 card-dark overflow-hidden" data-testid="plans-table">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-widest text-white/50">
                <tr className="border-b border-white/10">
                  <th className="text-left p-4">Plan</th>
                  <th className="text-left p-4">Price</th>
                  <th className="text-left p-4">Months</th>
                  <th className="text-left p-4">Discount %</th>
                  <th className="text-left p-4">Active</th>
                </tr>
              </thead>
              <tbody>
                {plans.map((p) => (
                  <tr key={p.id} className="border-b border-white/10">
                    <td className="p-4 font-bold">{p.name}</td>
                    <td className="p-4">₹{p.price.toLocaleString("en-IN")}</td>
                    <td className="p-4">{p.duration_months} +{p.extension_days}d</td>
                    <td className="p-4">
                      <input type="number" defaultValue={p.discount_percent} min={0} max={90} onBlur={(e)=>updatePlanDiscount(p.id, e.target.value)} className="input-dark max-w-[100px]" data-testid={`discount-input-${p.id}`} />
                    </td>
                    <td className="p-4">
                      <button onClick={() => togglePlan(p.id, p.active)} className={`text-xs uppercase tracking-widest font-bold ${p.active?"text-emerald-400":"text-rose-400"}`}>{p.active?"Active":"Disabled"}</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "users" && (
          <div className="mt-10 card-dark overflow-hidden" data-testid="users-table">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-widest text-white/50">
                <tr className="border-b border-white/10"><th className="text-left p-4">Name</th><th className="text-left p-4">Email</th><th className="text-left p-4">Mobile</th><th className="text-left p-4">Plan</th><th className="text-left p-4">Expires</th></tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-white/10">
                    <td className="p-4 font-bold">{u.name}</td>
                    <td className="p-4 text-white/70">{u.email}</td>
                    <td className="p-4 text-white/70">{u.mobile}</td>
                    <td className="p-4">{u.active_membership?.plan_name || "—"}</td>
                    <td className="p-4">{u.active_membership ? new Date(u.active_membership.expiry_date).toLocaleDateString() : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "classes" && (
          <div className="mt-10">
            {editingClass ? (
              <div className="max-w-xl">
                <ClassForm
                  initial={editingClass === "new" ? EMPTY_CLASS : editingClass}
                  onSave={saveClass}
                  onCancel={() => setEditingClass(null)}
                  saving={savingClass}
                  existingClasses={classes}
                />
              </div>
            ) : (
              <div className="mb-5">
                <button className="btn-primary" onClick={() => setEditingClass("new")} data-testid="new-class-btn">
                  <Plus size={16} /> New Class
                </button>
              </div>
            )}

            <div className="mt-5 grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {classes.map((c) => (
                <div key={c.id} className="card-dark p-5" data-testid={`class-card-${c.id}`}>
                  <div className="flex items-start justify-between">
                    <h3 className="heading text-xl">{c.name}</h3>
                    <div className="flex gap-2">
                      <button onClick={() => setEditingClass(c)} className="text-white/60 hover:text-orange" data-testid={`edit-class-${c.id}`}>
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => deleteClass(c.id, c.name)} className="text-white/60 hover:text-rose-400" data-testid={`delete-class-${c.id}`}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                  <p className="text-xs text-white/50 mt-1">{c.day_of_week} · {c.start_time} · {c.duration_minutes} min</p>
                  <p className="text-xs text-white/60 mt-2">Trainer: {c.trainer} · Capacity: {c.capacity} · {c.difficulty}</p>
                  <p className="text-sm text-white/70 mt-2">{c.description}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "trainers" && (
          <div className="mt-10" data-testid="trainers-admin">
            <p className="text-white/70 mb-6">All active trainers assigned to classes. Removing a trainer sets their classes to "TBA" — class data is kept.</p>
            <div className="card-dark overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-widest text-white/50">
                  <tr className="border-b border-white/10">
                    <th className="text-left p-4">Trainer</th>
                    <th className="text-left p-4">Assigned Classes</th>
                    <th className="text-left p-4">Total</th>
                    <th className="text-left p-4">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {uniqueTrainers.length === 0 && (
                    <tr><td className="p-6 text-white/50" colSpan="4">No trainers found.</td></tr>
                  )}
                  {uniqueTrainers.map((trainer) => {
                    const trainerClasses = classes.filter(c => c.trainer === trainer);
                    return (
                      <tr key={trainer} className="border-b border-white/10">
                        <td className="p-4 font-bold">{trainer}</td>
                        <td className="p-4 text-white/60 max-w-xs">
                          {trainerClasses.map(c => c.name).join(", ")}
                        </td>
                        <td className="p-4 text-white/60">{trainerClasses.length}</td>
                        <td className="p-4">
                          <button
                            disabled={removingTrainer === trainer}
                            onClick={() => removeTrainer(trainer)}
                            className="flex items-center gap-1.5 text-xs uppercase tracking-widest font-bold text-rose-400 hover:text-rose-300 disabled:opacity-50 disabled:cursor-not-allowed"
                            data-testid={`remove-trainer-${trainer}`}
                          >
                            <UserMinus size={14} />
                            {removingTrainer === trainer ? "Removing…" : "Remove"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {uniqueTrainers.length > 0 && (
              <p className="text-xs text-white/40 mt-4">* To reassign a removed trainer's classes, go to the Classes tab and edit each class individually.</p>
            )}
          </div>
        )}

        {tab === "payments" && (
          <div className="mt-10 card-dark overflow-hidden" data-testid="payments-table">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-widest text-white/50">
                <tr className="border-b border-white/10"><th className="text-left p-4">Invoice</th><th className="text-left p-4">Plan</th><th className="text-left p-4">Method</th><th className="text-left p-4">Amount</th><th className="text-left p-4">Date</th></tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} className="border-b border-white/10">
                    <td className="p-4 font-mono">{p.invoice_no}</td>
                    <td className="p-4">{p.plan_name}</td>
                    <td className="p-4 capitalize">{p.method.replace("_"," ")}</td>
                    <td className="p-4 font-bold text-orange">₹{p.amount.toLocaleString("en-IN")}</td>
                    <td className="p-4 text-white/60">{new Date(p.created_at).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "recovery" && (
          <div className="mt-10" data-testid="recovery-admin">
            <div className="flex items-center justify-between mb-4">
              <p className="text-white/70">Monthly recovery usage by member.</p>
              <button className="btn-secondary text-xs" onClick={resetRecovery} data-testid="reset-recovery-btn"><RotateCcw size={14}/> Reset This Month</button>
            </div>
            <div className="card-dark overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-xs uppercase tracking-widest text-white/50">
                  <tr className="border-b border-white/10"><th className="text-left p-4">User ID</th><th className="text-left p-4">Facility</th><th className="text-left p-4">Used</th><th className="text-left p-4">Month</th></tr>
                </thead>
                <tbody>
                  {recovery.map((r) => (
                    <tr key={r.id} className="border-b border-white/10">
                      <td className="p-4 font-mono text-xs">{r.user_id.slice(0,8)}…</td>
                      <td className="p-4 capitalize">{r.facility}</td>
                      <td className="p-4 font-bold">{r.count}/2</td>
                      <td className="p-4">{r.year_month}</td>
                    </tr>
                  ))}
                  {recovery.length === 0 && <tr><td className="p-6 text-white/50" colSpan="4">No usage yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
