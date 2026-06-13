import React, { useState } from "react";
import api, { formatErr } from "@/lib/api";
import { MapPin, Phone, Mail, Clock } from "lucide-react";
import { toast } from "sonner";

export default function ContactPage() {
  const [form, setForm] = useState({ name: "", email: "", phone: "", message: "" });
  const [sending, setSending] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setSending(true);
    try {
      await api.post("/contact", form);
      toast.success("Message sent. We'll be in touch shortly.");
      setForm({ name: "", email: "", phone: "", message: "" });
    } catch (e) {
      toast.error(formatErr(e.response?.data?.detail));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="pt-28 pb-24 px-5 md:px-8" data-testid="contact-page">
      <div className="max-w-7xl mx-auto">
        <p className="overline">Contact</p>
        <h1 className="heading text-5xl md:text-7xl mt-4">Walk in. <span className="text-orange">Talk to us.</span></h1>

        <div className="grid md:grid-cols-2 gap-12 mt-14">
          <div>
            <div className="space-y-5">
              {[
                {icon: <MapPin/>, t: "Address", s: "Vijaya Kakatiya Elite(Old Vijaya Theater) 4th floor,Kakaji Colony, Warangal, India 506001"},
                {icon: <Phone/>, t: "Phone", s: "+91 1234567890"},
                {icon: <Mail/>, t: "Email", s: "hello@grindstation.in"},
                {icon: <Clock/>, t: "Open", s: "everyday 6am - 11pm"},
              ].map((x, i) => (
                <div key={i} className="flex items-start gap-4 card-dark p-5">
                  <div className="text-orange">{x.icon}</div>
                  <div>
                    <div className="text-xs uppercase tracking-widest text-white/50">{x.t}</div>
                    <div className="text-white mt-1">{x.s}</div>
                  </div>
                </div>
              ))}
            </div>
            <div className="card-dark mt-6 overflow-hidden">
              <iframe
                title="map"
                src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3794.45735646156!2d79.5697093!3d18.0039662!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3a3345004d08d59b%3A0x76c5847310e094b1!2sVijaya%20kakatiya%20Elite!5e0!3m2!1sen!2sin!4v1781360435725!5m2!1sen!2sin"
                width="100%"
                height="280"
                style={{ border: 0, filter: "invert(0.9) hue-rotate(180deg)" }}
                allowFullScreen=""
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
              />
            </div>
          </div>

          <form onSubmit={submit} className="card-dark p-7" data-testid="contact-form">
            <h3 className="heading text-3xl">Send us a message</h3>
            <div className="mt-6 space-y-4">
              <input className="input-dark" placeholder="Your name" required value={form.name} onChange={e=>setForm({...form, name: e.target.value})} data-testid="contact-name" />
              <input className="input-dark" placeholder="Email" type="email" required value={form.email} onChange={e=>setForm({...form, email: e.target.value})} data-testid="contact-email" />
              <input className="input-dark" placeholder="Phone (optional)" value={form.phone} onChange={e=>setForm({...form, phone: e.target.value})} />
              <textarea className="input-dark min-h-[140px] resize-y" placeholder="Your message" required value={form.message} onChange={e=>setForm({...form, message: e.target.value})} data-testid="contact-message" />
              <button type="submit" disabled={sending} className="btn-primary w-full justify-center" data-testid="contact-submit">
                {sending ? "Sending…" : "Send Message"}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
