import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api, { formatErr } from "@/lib/api";
import { useAuth } from "@/context/AuthContext";
import { Check, X } from "lucide-react";
import { toast } from "sonner";

function loadRazorpayScript() {
  return new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const s = document.createElement("script");
    s.src = "https://checkout.razorpay.com/v1/checkout.js";
    s.onload = () => resolve(true);
    s.onerror = () => resolve(false);
    document.body.appendChild(s);
  });
}

export default function MembershipsPage() {
  const [plans, setPlans] = useState([]);
  const [selected, setSelected] = useState(null);
  const [method, setMethod] = useState("upi");
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", name: "" });
  const [upiId, setUpiId] = useState("");
  const [processing, setProcessing] = useState(false);
  const [config, setConfig] = useState({ razorpay_enabled: false });
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    const loadData = async () => {
      try {
        const plansRes = await api.get("/plans");
        if (Array.isArray(plansRes.data)) {
          setPlans(plansRes.data);
        } else {
          setPlans([]);
        }
        const configRes = await api.get("/payment/config");
        setConfig(configRes.data);
      } catch (err) {
        console.error("Failed to load memberships data:", err);
      }
    };
    loadData();
  }, []);

  const open = (p) => {
    if (!user) { navigate("/login", { state: { from: "/memberships" } }); return; }
    setSelected(p); setMethod("upi"); setCard({ number: "", expiry: "", cvv: "", name: "" }); setUpiId("");
  };

  const handleRazorpay = async (order) => {
    const loaded = await loadRazorpayScript();
    if (!loaded) throw new Error("Razorpay SDK failed to load");
    return new Promise((resolve, reject) => {
      const rzp = new window.Razorpay({
        key: order.razorpay_key_id,
        amount: order.amount_paise,
        currency: order.currency,
        order_id: order.razorpay_order_id,
        name: "The Grind Station",
        description: order.plan_name,
        prefill: { name: user.name, email: user.email, contact: user.mobile },
        theme: { color: "#FF4500" },
        method: { upi: true, card: true, netbanking: true, wallet: false, emi: false, paylater: false },
        upi: { flow: "collect" },
        handler: (r) => resolve(r),
        modal: { ondismiss: () => reject(new Error("Payment cancelled")) },
      });
      rzp.open();
    });
  };

  const pay = async () => {
    if (!selected) return;
    setProcessing(true);
    try {
      if (method === "upi" && !upiId.includes("@") && !config.razorpay_enabled)
        throw new Error("Enter a valid UPI ID (e.g. name@bank)");
      if (!config.razorpay_enabled && (method === "debit_card" || method === "credit_card")) {
        if (card.number.replace(/\s/g, "").length < 12) throw new Error("Enter a valid card number");
        if (!card.expiry || !card.cvv) throw new Error("Card expiry and CVV required");
      }
      const { data: order } = await api.post("/subscribe/create-order", {
        plan_id: selected.id, payment_method: method,
        ...(method === "upi" ? { upi_id: upiId } : { card_last4: card.number.slice(-4) }),
      });
      let verify_body = { pending_payment_id: order.pending_payment_id };
      if (order.razorpay_enabled) {
        const r = await handleRazorpay(order);
        verify_body = {
          pending_payment_id: order.pending_payment_id,
          razorpay_order_id: r.razorpay_order_id,
          razorpay_payment_id: r.razorpay_payment_id,
          razorpay_signature: r.razorpay_signature,
        };
      }
      const { data: result } = await api.post("/subscribe/verify", verify_body);
      toast.success(`Payment successful! Invoice ${result.payment.invoice_no}`);
      setSelected(null);
      navigate("/dashboard");
    } catch (e) {
      toast.error(e.message || formatErr(e.response?.data?.detail));
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="pt-28 pb-24 px-5 md:px-8" data-testid="memberships-page">
      <div className="max-w-7xl mx-auto">
        <p className="overline">Memberships</p>
        <h1 className="heading text-5xl md:text-7xl mt-4">Choose your <span className="text-orange">commitment.</span></h1>
        <p className="text-white/70 mt-6 max-w-2xl">Every plan includes full gym access, group classes and the recovery zone. Longer commitments unlock deeper discounts and free extension days.</p>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 mt-14">
          {plans.map((p) => {
            const finalPrice = Math.round(p.price * (1 - p.discount_percent / 100));
            return (
              <div key={p.id} className={`card-dark p-7 relative ${p.popular ? "border-orange/60" : ""}`} data-testid={`plan-card-${p.id}`}>
                {p.discount_percent > 0 && <div className="absolute -top-3 left-7 badge-discount" data-testid={`discount-badge-${p.id}`}>{p.discount_percent}% OFF</div>}
                {p.popular && <div className="absolute -top-3 right-7 text-[10px] uppercase tracking-widest bg-white text-black px-3 py-1 rounded-full font-bold">Most Popular</div>}
                <h3 className="heading text-2xl mt-2">{p.name.replace(" Membership", "")}</h3>
                <p className="text-xs uppercase tracking-widest text-white/50 mt-1">
                  {p.duration_months} Month{p.duration_months > 1 ? "s" : ""}{p.extension_days ? ` + ${p.extension_days} Days` : ""}
                </p>
                <div className="heading text-5xl mt-5 text-orange">₹{finalPrice.toLocaleString("en-IN")}</div>
                {p.discount_percent > 0 && <div className="text-sm text-white/40 line-through">₹{p.price.toLocaleString("en-IN")}</div>}
                <ul className="mt-6 space-y-2 text-sm text-white/80">
                  {p.features.map((f, i) => <li key={i} className="flex items-start gap-2"><Check size={16} className="text-orange mt-0.5" /> {f}</li>)}
                </ul>
                <button className="btn-primary w-full mt-7 justify-center" onClick={() => open(p)} data-testid={`join-plan-${p.id}`}>
                  Join Now
                </button>
              </div>
            );
          })}
        </div>

        <div className="mt-16 card-dark p-7 max-w-3xl">
          <p className="overline">Accepted Payment</p>
          <h3 className="heading text-3xl mt-3">UPI · Debit Card · Credit Card</h3>
          <p className="text-sm text-white/60 mt-2">
            {config.razorpay_enabled
              ? "Secure checkout powered by Razorpay. Test cards accepted in test mode."
              : "Demo mode — no real money is charged. Plug in Razorpay keys to enable live checkout."}
          </p>
        </div>
      </div>

      {selected && (
        <div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4" data-testid="payment-modal">
          <div className="card-dark p-8 max-w-lg w-full relative">
            <button className="absolute top-4 right-4 text-white/60 hover:text-white" onClick={() => setSelected(null)} data-testid="close-payment-modal"><X /></button>
            <p className="overline">Checkout</p>
            <h3 className="heading text-3xl mt-2">{selected.name}</h3>
            <div className="flex items-baseline justify-between mt-4 pb-4 border-b border-white/10">
              <span className="text-sm text-white/60">Amount Payable</span>
              <span className="heading text-4xl text-orange">₹{Math.round(selected.price * (1 - selected.discount_percent / 100)).toLocaleString("en-IN")}</span>
            </div>

            <div className="mt-5">
              <label className="text-xs uppercase tracking-widest text-white/50 mb-2 block">Payment Method</label>
              <div className="grid grid-cols-3 gap-2">
                {[{ v: "upi", l: "UPI" }, { v: "debit_card", l: "Debit" }, { v: "credit_card", l: "Credit" }].map(m => (
                  <button key={m.v} onClick={() => setMethod(m.v)}
                    className={`p-3 border text-sm uppercase tracking-widest font-bold transition-colors ${method === m.v ? "border-orange text-orange" : "border-white/10 text-white/70"}`}
                    data-testid={`pay-method-${m.v}`}>
                    {m.l}
                  </button>
                ))}
              </div>
            </div>

            {config.razorpay_enabled ? (
              <div className="mt-5">
                {method === "upi" && (
                  <div className="mb-4">
                    <label className="text-xs uppercase tracking-widest text-white/50 mb-2 block">UPI ID</label>
                    <input
                      className="input-dark"
                      placeholder="yourname@upi (e.g. success@razorpay for test)"
                      value={upiId}
                      onChange={e => setUpiId(e.target.value)}
                      data-testid="upi-id-input"
                    />
                    <p className="text-xs text-white/40 mt-1">Or use the QR code in Razorpay checkout</p>
                  </div>
                )}
                <p className="text-xs text-white/60">
                  {method === "upi"
                    ? "Enter your UPI ID above or scan QR in the next screen."
                    : "You'll complete payment securely via Razorpay."}
                </p>
              </div>
            ) : method === "upi" ? (
              <div className="mt-5">
                <label className="text-xs uppercase tracking-widest text-white/50 mb-2 block">UPI ID</label>
                <input className="input-dark" placeholder="name@upi" value={upiId} onChange={e => setUpiId(e.target.value)} data-testid="upi-id-input" />
              </div>
            ) : (
              <div className="mt-5 space-y-3">
                <input className="input-dark" placeholder="Card Number" value={card.number} onChange={e => setCard({ ...card, number: e.target.value })} data-testid="card-number-input" />
                <input className="input-dark" placeholder="Cardholder Name" value={card.name} onChange={e => setCard({ ...card, name: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <input className="input-dark" placeholder="MM/YY" value={card.expiry} onChange={e => setCard({ ...card, expiry: e.target.value })} />
                  <input className="input-dark" placeholder="CVV" value={card.cvv} onChange={e => setCard({ ...card, cvv: e.target.value })} />
                </div>
              </div>
            )}

            <button onClick={pay} disabled={processing} className="btn-primary w-full mt-6 justify-center" data-testid="confirm-payment-btn">
              {processing ? "Processing…" : `Pay ₹${Math.round(selected.price * (1 - selected.discount_percent / 100)).toLocaleString("en-IN")}`}
            </button>
            <p className="text-[11px] text-white/40 text-center mt-3">
              {config.razorpay_enabled ? "Secured by Razorpay." : "Demo payment — no real money is charged."}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}