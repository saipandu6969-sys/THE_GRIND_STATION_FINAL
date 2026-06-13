import React from "react";
import { Instagram, Facebook, Twitter, MapPin, Phone, Mail } from "lucide-react";
import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="bg-black border-t border-white/10 mt-24" data-testid="footer">
      <div className="max-w-7xl mx-auto px-5 md:px-8 py-16 grid md:grid-cols-4 gap-10">
        <div>
          <h3 className="heading text-3xl"><span className="text-orange">THE GRIND</span> STATION</h3>
          <p className="mt-4 text-sm text-white/60 max-w-xs">Transform Your Body. Build Your Grind. Premium fitness, recovery & community.</p>
          <div className="flex gap-3 mt-5">
            <a
              href="https://www.instagram.com/tgsfitnessstudio?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw=="
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 border border-white/10 hover:border-orange transition-colors"
            >
            <Instagram size={18} />
            </a>
           
        </div>
        </div>
        <div>
          <p className="overline">Explore</p>
          <ul className="mt-4 space-y-2 text-sm">
            <li><Link to="/memberships" className="hover:text-orange">Memberships</Link></li>
            <li><Link to="/classes" className="hover:text-orange">Group Classes</Link></li>
            <li><Link to="/recovery" className="hover:text-orange">Recovery Zone</Link></li>
            <li><Link to="/contact" className="hover:text-orange">Contact</Link></li>
          </ul>
        </div>
        <div>
          <p className="overline">Contact</p>
          <ul className="mt-4 space-y-3 text-sm text-white/70">
            <li className="flex items-start gap-2"><MapPin size={16} className="text-orange mt-1" /> Vijaya Kakatiya Elite(Old Vijaya Theater) 4th floor,Kakaji Colony, Warangal, India 506001</li>
            <li className="flex items-center gap-2"><Phone size={16} className="text-orange" /> +91 1234567890</li>
            <li className="flex items-center gap-2"><Mail size={16} className="text-orange" /> hello@grindstation.in</li>
          </ul>
        </div>
        <div>
          <p className="overline">Hours</p>
          <ul className="mt-4 space-y-2 text-sm text-white/70">
            <li>Mon – Fri · 6:00 – 23:00</li>
            <li>Sat – Sun · 6:00 – 22:00</li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/10 px-5 md:px-8 py-5 text-xs text-white/40 text-center">
        © {new Date().getFullYear()} The Grind Station. All rights reserved.
      </div>
    </footer>
  );
}
