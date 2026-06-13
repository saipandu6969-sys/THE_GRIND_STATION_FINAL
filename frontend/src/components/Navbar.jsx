import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { Menu, X, LogOut, User } from "lucide-react";
import { API_BASE } from "@/lib/api";

const links = [
  { to: "/", label: "Home" },
  { to: "/memberships", label: "Memberships" },
  { to: "/classes", label: "Classes" },
  { to: "/recovery", label: "Recovery" },
  { to: "/contact", label: "Contact" },
];

export default function Navbar() {
  const { user, logout } = useAuth();
  const [open, setOpen] = React.useState(false);
  const navigate = useNavigate();

  return (
    <nav className="fixed top-0 inset-x-0 z-50 bg-[#0A0A0A]/85 backdrop-blur-xl border-b border-white/10" data-testid="main-navbar">
      <div className="max-w-7xl mx-auto px-5 md:px-8 flex items-center justify-between h-16 md:h-20">
        <Link to="/" className="flex items-center gap-2" data-testid="nav-logo">
          <span className="text-orange font-display text-2xl md:text-3xl font-extrabold tracking-tight">THE GRIND</span>
          <span className="text-white font-display text-2xl md:text-3xl font-extrabold tracking-tight">STATION</span>
        </Link>
        <div className="hidden md:flex items-center gap-8">
          {links.map((l) => (
            <NavLink
              key={l.to}
              to={l.to}
              data-testid={`nav-${l.label.toLowerCase()}`}
              className={({ isActive }) =>
                `text-sm uppercase tracking-widest font-semibold transition-colors ${
                  isActive ? "text-orange" : "text-white/80 hover:text-white"
                }`
              }
            >
              {l.label}
            </NavLink>
          ))}
        </div>
        <div className="hidden md:flex items-center gap-3">
          {user && user.role ? (
            <>
              <Link to={user.role === "admin" ? "/admin" : "/dashboard"} className="flex items-center gap-2 px-3 py-2 border border-white/10 hover:border-orange transition-colors text-xs uppercase tracking-widest font-bold" data-testid="nav-dashboard-btn">
                {user.avatar_url ? (
                  <img src={`${API_BASE.replace('/api','')}${user.avatar_url}`} alt="" className="w-6 h-6 rounded-full object-cover border border-orange/40" />
                ) : (
                  <User size={16} />
                )}
                {user.role === "admin" ? "Admin" : "Dashboard"}
              </Link>
              <button className="btn-secondary text-xs" onClick={async () => { await logout(); navigate("/"); }} data-testid="nav-logout-btn">
                <LogOut size={16} /> Logout
              </button>
            </>
          ) : (
            <>
              <Link to="/login" className="btn-secondary text-xs" data-testid="nav-login-btn">Login</Link>
              <Link to="/register" className="btn-primary text-xs" data-testid="nav-join-btn">Join Now</Link>
            </>
          )}
        </div>
        <button className="md:hidden text-white" onClick={() => setOpen(!open)} data-testid="mobile-menu-btn">
          {open ? <X /> : <Menu />}
        </button>
      </div>
      {open && (
        <div className="md:hidden bg-[#0A0A0A] border-t border-white/10 px-5 py-4 flex flex-col gap-3" data-testid="mobile-menu">
          {links.map((l) => (
            <Link key={l.to} to={l.to} onClick={() => setOpen(false)} className="text-sm uppercase tracking-widest font-semibold py-2">
              {l.label}
            </Link>
          ))}
          {user && user.role ? (
            <>
              <Link to={user.role === "admin" ? "/admin" : "/dashboard"} onClick={() => setOpen(false)} className="btn-secondary text-xs">
                {user.role === "admin" ? "Admin" : "Dashboard"}
              </Link>
              <button className="btn-secondary text-xs" onClick={async () => { await logout(); setOpen(false); navigate("/"); }}>Logout</button>
            </>
          ) : (
            <>
              <Link to="/login" onClick={() => setOpen(false)} className="btn-secondary text-xs">Login</Link>
              <Link to="/register" onClick={() => setOpen(false)} className="btn-primary text-xs">Join Now</Link>
            </>
          )}
        </div>
      )}
    </nav>
  );
}
