import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowRight, Dumbbell, Flame, Snowflake, Wind, Users, Award, Target, Heart } from "lucide-react";
import api from "@/lib/api";

const HERO_IMG = "https://images.unsplash.com/photo-1641337221253-fdc7237f6b61?w=1600";
const FACILITY_IMGS = {
  strength: "https://images.unsplash.com/photo-1722925541142-5db2668ca492?w=1200",
  cardio: "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=1200",
  boxing: "https://images.unsplash.com/photo-1608202409296-a9cad928dd2f?w=1200",
  recovery: "https://images.unsplash.com/photo-1717356495389-6ab1e5ff9d84?w=1200",
};

const testimonials = [
  { name: "Karthik R.", role: "Member · 2 yrs", text: "Grind Station completely changed how I train. The energy is unreal." },
  { name: "Anika S.", role: "Member · 1 yr", text: "The recovery zone is my favourite part. Ice bath after lifting = elite." },
  { name: "Devraj P.", role: "Member · 6 mo", text: "Coaches push you, never break you. Best gym I've ever joined." },
];

export default function HomePage() {
  const [plans, setPlans] = useState([]);
  useEffect(() => { api.get("/plans").then(r => setPlans(r.data)).catch(()=>{}); }, []);

  return (
    <div data-testid="home-page">
      {/* HERO */}
      <section className="relative min-h-[100vh] flex items-center overflow-hidden">
        <div className="absolute inset-0">
          <img src={HERO_IMG} alt="" className="w-full h-full object-cover opacity-50" />
          <div className="absolute inset-0 bg-gradient-to-r from-black via-black/80 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-black via-black/40 to-transparent" />
        </div>
        <div className="hero-glow" />
        <div className="grain" />
        <div className="relative max-w-7xl mx-auto px-5 md:px-8 pt-32 pb-20 w-full">
          <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.8 }}>
            <p className="overline" data-testid="hero-overline">Hanamkonda · Established 2026</p>
            <h1 className="heading text-6xl sm:text-7xl md:text-8xl lg:text-9xl mt-6 max-w-5xl leading-[0.85]">
              Transform Your <span className="text-orange">Body.</span><br />
              Build Your <span className="text-orange">Grind.</span>
            </h1>
            <p className="mt-8 text-base md:text-lg text-white/70 max-w-xl">
              India's most uncompromising strength, conditioning & recovery facility. No shortcuts. No filler. Just the work.
            </p>
            <div className="mt-10 flex flex-wrap gap-4" data-testid="hero-cta">
              <Link to="/register" className="btn-primary" data-testid="hero-join-btn">Join Now <ArrowRight size={18} /></Link>
              <Link to="/memberships" className="btn-secondary" data-testid="hero-memberships-btn">View Memberships</Link>
              <Link to="/classes" className="btn-secondary" data-testid="hero-classes-btn">Book Classes</Link>
            </div>
            <div className="mt-16 flex flex-wrap gap-12 text-white/70">
              <div><div className="heading text-4xl text-white">2,400+</div><div className="text-xs uppercase tracking-widest mt-1">Active Members</div></div>
              <div><div className="heading text-4xl text-white">35</div><div className="text-xs uppercase tracking-widest mt-1">Elite Coaches</div></div>
              <div><div className="heading text-4xl text-white">120</div><div className="text-xs uppercase tracking-widest mt-1">Weekly Classes</div></div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ABOUT */}
      <section className="py-24 px-5 md:px-8" data-testid="about-section">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <div>
            <p className="overline">About Us</p>
            <h2 className="heading text-5xl md:text-6xl mt-4">Where Discipline <br/>Meets <span className="text-orange">Design.</span></h2>
            <p className="text-white/70 mt-6 leading-relaxed">
              The Grind Station isn't a chain. It's a single 18,000 sq.ft. facility built by lifters, fighters and physiotherapists. Every barbell, every recovery pod, every coach has been chosen to push you forward, faster.
            </p>
            <div className="grid grid-cols-2 gap-6 mt-10">
              {[
                {icon: <Award size={20}/>, t: "Certified Coaches", s: "NSCA, ISSA & ACE certified team"},
                {icon: <Target size={20}/>, t: "Goal-First Programs", s: "Strength, fat loss, hybrid"},
                {icon: <Heart size={20}/>, t: "Recovery-Led", s: "Sauna · Steam · Ice baths"},
                {icon: <Users size={20}/>, t: "Tight-Knit Community", s: "No ego. Only output."},
              ].map((x, i) => (
                <div key={i} className="flex items-start gap-3">
                  <div className="text-orange mt-1">{x.icon}</div>
                  <div><div className="font-bold">{x.t}</div><div className="text-sm text-white/60">{x.s}</div></div>
                </div>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <img src={FACILITY_IMGS.strength} alt="" className="w-full h-72 object-cover rounded-lg" />
            <img src={FACILITY_IMGS.boxing} alt="" className="w-full h-48 object-cover rounded-lg mt-12" />
            <img src={FACILITY_IMGS.recovery} alt="" className="w-full h-48 object-cover rounded-lg" />
            <img src={FACILITY_IMGS.cardio} alt="" className="w-full h-72 object-cover rounded-lg -mt-8" />
          </div>
        </div>
      </section>

      {/* FACILITIES */}
      <section className="py-24 px-5 md:px-8 bg-[#0F0F0F]" data-testid="facilities-section">
        <div className="max-w-7xl mx-auto">
          <p className="overline">Facilities</p>
          <h2 className="heading text-5xl md:text-6xl mt-4 max-w-2xl">Built for those who <span className="text-orange">don't quit.</span></h2>
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            {[
              {icon: <Dumbbell />, t: "Strength Floor", s: "30+ Olympic platforms, calibrated plates, premium racks."},
              {icon: <Flame />, t: "Conditioning Arena", s: "Air bikes, ski-ergs, rowers and sled tracks."},
              {icon: <Wind />, t: "Combat Studio", s: "Heavy bags, ring, MMA cage and dedicated coaches."},
              {icon: <Heart />, t: "Recovery Zone", s: "Sauna, steam room and 4-person ice bath."},
              {icon: <Users />, t: "Group Studio", s: "Acoustic-tuned room for HIIT, yoga and dance."},
              {icon: <Award />, t: "Performance Lab", s: "InBody scans, VO2 max, lactate threshold testing."},
            ].map((f, i) => (
              <div key={i} className="card-dark p-7" data-testid={`facility-${i}`}>
                <div className="text-orange">{f.icon}</div>
                <h3 className="heading text-2xl mt-4">{f.t}</h3>
                <p className="text-sm text-white/60 mt-2">{f.s}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLANS PREVIEW */}
      <section className="py-24 px-5 md:px-8" data-testid="plans-preview-section">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-end justify-between flex-wrap gap-4">
            <div>
              <p className="overline">Memberships</p>
              <h2 className="heading text-5xl md:text-6xl mt-4">Pick your <span className="text-orange">grind.</span></h2>
            </div>
            <Link to="/memberships" className="btn-secondary">See all plans <ArrowRight size={16} /></Link>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 mt-12">
            {plans.map((p) => (
              <div key={p.id} className={`card-dark p-7 relative ${p.popular ? "border-orange/60" : ""}`}>
                {p.discount_percent > 0 && (
                  <div className="absolute -top-3 left-7 badge-discount">{p.discount_percent}% OFF</div>
                )}
                {p.popular && <div className="absolute -top-3 right-7 text-[10px] uppercase tracking-widest bg-white text-black px-3 py-1 rounded-full font-bold">Most Popular</div>}
                <h3 className="heading text-2xl mt-2">{p.name.replace(" Membership","")}</h3>
                <div className="heading text-5xl mt-4 text-orange">₹{Math.round(p.price * (1 - p.discount_percent/100)).toLocaleString("en-IN")}</div>
                {p.discount_percent > 0 && <div className="text-sm text-white/40 line-through">₹{p.price.toLocaleString("en-IN")}</div>}
                <p className="text-xs uppercase tracking-widest text-white/50 mt-3">{p.duration_months} Mo{p.extension_days ? ` + ${p.extension_days}d ext` : ""}</p>
                <ul className="mt-5 space-y-2 text-sm text-white/70">
                  {p.features.slice(0,3).map((f, i) => <li key={i}>✓ {f}</li>)}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* RECOVERY ZONE */}
      <section className="py-24 px-5 md:px-8 bg-[#0F0F0F]" data-testid="recovery-section">
        <div className="max-w-7xl mx-auto grid md:grid-cols-2 gap-16 items-center">
          <img src={FACILITY_IMGS.recovery} alt="" className="w-full h-[500px] object-cover rounded-lg" />
          <div>
            <p className="overline">Recovery Zone</p>
            <h2 className="heading text-5xl md:text-6xl mt-4">Push hard. <br/><span className="text-orange">Recover harder.</span></h2>
            <p className="text-white/70 mt-6">Every member gets curated access to our recovery suite. Each facility is capped to 2 sessions per month per member, so the room is never crowded and the experience stays elite.</p>
            <div className="mt-8 space-y-4">
              {[
                {icon: <Flame className="text-orange"/>, t: "Sauna Bath", s: "Dry heat · 80–95°C · 2x / month"},
                {icon: <Wind className="text-orange"/>, t: "Steam Bath", s: "100% humidity · 45°C · 2x / month"},
                {icon: <Snowflake className="text-orange"/>, t: "Ice Bath", s: "3–5°C contrast plunge · 2x / month"},
              ].map((r, i) => (
                <div key={i} className="flex items-center gap-4 p-4 border border-white/10 rounded-lg">
                  {r.icon}
                  <div><div className="font-bold">{r.t}</div><div className="text-sm text-white/60">{r.s}</div></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* TESTIMONIALS */}
      <section className="py-24 px-5 md:px-8" data-testid="testimonials-section">
        <div className="max-w-7xl mx-auto">
          <p className="overline">Members</p>
          <h2 className="heading text-5xl md:text-6xl mt-4">Words from the <span className="text-orange">floor.</span></h2>
          <div className="grid md:grid-cols-3 gap-6 mt-12">
            {testimonials.map((t, i) => (
              <div key={i} className="card-dark p-7">
                <p className="text-orange heading text-5xl leading-none">"</p>
                <p className="text-white/80 mt-2 leading-relaxed">{t.text}</p>
                <div className="mt-6 pt-5 border-t border-white/10">
                  <div className="font-bold">{t.name}</div>
                  <div className="text-xs uppercase tracking-widest text-white/50">{t.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-5 md:px-8 bg-[#0F0F0F]">
        <div className="max-w-7xl mx-auto text-center">
          <h2 className="heading text-5xl md:text-7xl">Ready to <span className="text-orange">start?</span></h2>
          <p className="text-white/70 mt-6 max-w-xl mx-auto">Join 2,400+ members rewriting their physical story every single morning. Walk in. Train hard. Leave better.</p>
          <div className="mt-10 flex justify-center gap-4 flex-wrap">
            <Link to="/register" className="btn-primary" data-testid="cta-join-btn">Become a Member <ArrowRight size={18}/></Link>
            <Link to="/contact" className="btn-secondary">Visit the Facility</Link>
          </div>
        </div>
      </section>
    </div>
  );
}
