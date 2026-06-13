# The Grind Station — PRD

## Original Problem Statement
Build a premium gym membership platform called **The Grind Station** with dark luxury theme (black / charcoal / orange), mobile-responsive, end-to-end:
Home, Memberships, Classes, Recovery Zone, Member Dashboard, Admin Dashboard, Contact, Auth, mocked Razorpay payment, QR digital card, WhatsApp button.

## User Choices (verbatim)
- Stack: **React + FastAPI + MongoDB** (platform default)
- Payment: **MOCKED** (no real Razorpay charges)
- Auth: **Email + Password only** (JWT)
- Email: **In-app notifications only** (no SendGrid/Resend keys yet)
- Admin: **Seeded default** (admin@grindstation.com)

## Architecture
- **Backend**: FastAPI (`/app/backend/server.py`) — single file, ~450 lines, all routes under `/api`. Auth via PyJWT + bcrypt; httpOnly cookies + Bearer token fallback.
- **Frontend**: React 19 + react-router 7 + framer-motion + sonner toasts. Pages in `/app/frontend/src/pages/`, components in `/app/frontend/src/components/`, axios wrapper in `/app/frontend/src/lib/api.js`, auth context in `/app/frontend/src/context/AuthContext.jsx`.
- **DB**: MongoDB collections — `users`, `plans`, `memberships`, `payments`, `classes`, `class_bookings`, `recovery_usage`, `contact_messages`. UUIDs (string `id` field) — no ObjectId leakage.
- **Theme**: Barlow Condensed (headings) + Manrope (body); colors `#0A0A0A` / `#1A1A1A` / `#FF4500`.

## What's Been Implemented (2026-02-10, updated iter 3)
- **Public pages**: Home, Memberships, Classes (calendar), Recovery, Contact.
- **Auth**: Register, Login, Logout, `/auth/me`, Forgot/Reset password (1hr token, dev_token returned without email provider).
- **Memberships**: 4 default plans with admin-editable discount badges.
- **Payment**: Razorpay scaffold with HMAC verify + mock fallback. UI auto-switches via `/api/payment/config`.
- **Member Dashboard**: Digital QR card + **avatar upload (NEW)** with image preview in navbar, recovery widget, bookings (cancellable), payments with **branded PDF invoice download**.
- **Classes**: Calendar view with Today/Tomorrow/+2/+3 pills + 0–3 day advance booking enforcement.
- **Recovery Zone**: 3 facilities × 2/month limit + admin reset.
- **Admin Dashboard**: 6 tabs with analytics, discount editor, plan toggle.
- **PWA (NEW)**: manifest.json, sw.js (offline shell + asset cache), icon-192/512.png + icon.svg, installable on mobile/desktop, theme color #FF4500 on #0A0A0A.
- **Avatar storage (NEW)**: Emergent Object Storage via `put_object`/`get_object` helpers. JPEG/PNG/WebP, ≤2MB, served public via `/api/me/avatar/{user_id}`.
- **Email/SMS**: console-log stub in `send_email()` — drop-in Resend/SendGrid swap.
- **Testing**: **65/65 backend tests passing** (v1 + v2 + v3 suites).

## Test Credentials (mirrored in `/app/memory/test_credentials.md`)
- Admin: `admin@grindstation.com` / `Admin@Grind2026`
- Member: `member@grindstation.com` / `Member@Grind2026`

## Prioritized Backlog
### P1 — Next iteration
- Real Razorpay integration (needs user API keys)
- Email notifications (booking confirmations, expiry reminders) — needs Resend/SendGrid keys
- Class schedule calendar view + 2–3 day advance booking window enforcement
- Renewal reminder cron + auto-expiry status update

### P2 — Polish
- Brute-force login lockout (per auth playbook)
- Forgot/reset password flow + token table
- PDF invoice generation
- Member profile edit page
- Trainer profile pages + class detail pages
- Image upload for member avatars (object storage)
- Google OAuth (Emergent-managed)
- Mobile install (PWA)

## Next Tasks
1. Confirm with user whether to plug in real Razorpay test keys.
2. Decide email provider + collect keys for renewal/expiry reminders.
3. Add class schedule calendar + advance booking window check.
