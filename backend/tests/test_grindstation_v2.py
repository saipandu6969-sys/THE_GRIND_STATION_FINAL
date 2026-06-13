"""Grind Station v2 — new endpoint tests (Razorpay mock, forgot/reset password,
advance booking window, PDF invoice, dashboard filter)."""
import os
import uuid
from datetime import datetime, timezone, timedelta

import pytest
import requests

BASE_URL = os.environ["REACT_APP_BACKEND_URL"].rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@grindstation.com", "password": "Admin@Grind2026"}
MEMBER = {"email": "member@grindstation.com", "password": "Member@Grind2026"}


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"]


def _register_fresh():
    email = f"v2_{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/auth/register", json={
        "name": "V2 Tester", "email": email, "mobile": "+919000000000",
        "password": "Pass@1234"}, timeout=20)
    assert r.status_code == 200, r.text
    return r.json()["access_token"], email


@pytest.fixture(scope="session")
def admin_token():
    return _login(ADMIN)


@pytest.fixture(scope="session")
def fresh_member():
    """Fresh user — token, email. Subscribes (mock razorpay) to obtain active membership."""
    tok, email = _register_fresh()
    plans = requests.get(f"{API}/plans", timeout=15).json()
    monthly = next(p for p in plans if p["name"] == "Monthly Membership")
    order = requests.post(f"{API}/subscribe/create-order",
                          json={"plan_id": monthly["id"], "payment_method": "upi", "upi_id": "x@upi"},
                          headers=_h(tok), timeout=20).json()
    requests.post(f"{API}/subscribe/verify",
                  json={"pending_payment_id": order["pending_payment_id"]},
                  headers=_h(tok), timeout=20)
    return tok, email


# -------- Payment Config --------
def test_payment_config_disabled_when_no_keys():
    r = requests.get(f"{API}/payment/config", timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["razorpay_enabled"] is False
    assert d["key_id"] is None


# -------- Razorpay-style flow (mock) --------
def test_create_order_returns_pending_payment_id_inr_and_mock_flag():
    tok, _ = _register_fresh()
    plans = requests.get(f"{API}/plans", timeout=15).json()
    monthly = next(p for p in plans if p["name"] == "Monthly Membership")
    expected = round(monthly["price"] * (1 - monthly["discount_percent"] / 100.0), 2)
    r = requests.post(f"{API}/subscribe/create-order",
                      json={"plan_id": monthly["id"], "payment_method": "upi", "upi_id": "x@upi"},
                      headers=_h(tok), timeout=20)
    assert r.status_code == 200, r.text
    d = r.json()
    assert d["razorpay_enabled"] is False
    assert d["currency"] == "INR"
    assert d["amount"] == expected
    assert d["amount_paise"] == int(expected * 100)
    assert d["razorpay_order_id"] is None
    assert d["razorpay_key_id"] is None
    assert isinstance(d["pending_payment_id"], str) and len(d["pending_payment_id"]) > 10


def test_verify_creates_membership_and_deactivates_prior():
    tok, _ = _register_fresh()
    plans = requests.get(f"{API}/plans", timeout=15).json()
    monthly = next(p for p in plans if p["name"] == "Monthly Membership")
    quarterly = next(p for p in plans if p["name"] == "Quarterly Membership")

    # First order/verify
    o1 = requests.post(f"{API}/subscribe/create-order",
                       json={"plan_id": monthly["id"], "payment_method": "upi"},
                       headers=_h(tok), timeout=20).json()
    v1 = requests.post(f"{API}/subscribe/verify",
                       json={"pending_payment_id": o1["pending_payment_id"]},
                       headers=_h(tok), timeout=20)
    assert v1.status_code == 200, v1.text
    assert v1.json()["payment"]["status"] == "success"
    assert v1.json()["membership"]["plan_name"] == "Monthly Membership"

    # Second order/verify — should deactivate first
    o2 = requests.post(f"{API}/subscribe/create-order",
                       json={"plan_id": quarterly["id"], "payment_method": "credit_card", "card_last4": "4242"},
                       headers=_h(tok), timeout=20).json()
    v2 = requests.post(f"{API}/subscribe/verify",
                       json={"pending_payment_id": o2["pending_payment_id"]},
                       headers=_h(tok), timeout=20)
    assert v2.status_code == 200
    assert v2.json()["membership"]["plan_name"] == "Quarterly Membership"

    dash = requests.get(f"{API}/dashboard/me", headers=_h(tok), timeout=15).json()
    assert dash["membership"]["plan_name"] == "Quarterly Membership"
    assert dash["membership"]["status"] == "active"


def test_verify_twice_second_call_fails_400():
    tok, _ = _register_fresh()
    plans = requests.get(f"{API}/plans", timeout=15).json()
    pid = plans[0]["id"]
    o = requests.post(f"{API}/subscribe/create-order",
                      json={"plan_id": pid, "payment_method": "upi"},
                      headers=_h(tok), timeout=20).json()
    r1 = requests.post(f"{API}/subscribe/verify",
                      json={"pending_payment_id": o["pending_payment_id"]},
                      headers=_h(tok), timeout=20)
    assert r1.status_code == 200
    r2 = requests.post(f"{API}/subscribe/verify",
                      json={"pending_payment_id": o["pending_payment_id"]},
                      headers=_h(tok), timeout=20)
    assert r2.status_code == 400


def test_legacy_subscribe_still_works():
    tok, _ = _register_fresh()
    plans = requests.get(f"{API}/plans", timeout=15).json()
    monthly = next(p for p in plans if p["name"] == "Monthly Membership")
    r = requests.post(f"{API}/subscribe",
                     json={"plan_id": monthly["id"], "payment_method": "upi"},
                     headers=_h(tok), timeout=20)
    assert r.status_code == 200
    d = r.json()
    assert d["payment"]["status"] == "success"
    assert d["membership"]["status"] == "active"


# -------- Forgot / Reset password --------
def test_forgot_password_existing_email_returns_dev_token():
    tok, email = _register_fresh()
    r = requests.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d["ok"] is True
    assert "dev_token" in d and isinstance(d["dev_token"], str) and len(d["dev_token"]) > 20


def test_forgot_password_unknown_email_no_leak():
    r = requests.post(f"{API}/auth/forgot-password",
                      json={"email": f"nope_{uuid.uuid4().hex[:6]}@example.com"}, timeout=15)
    assert r.status_code == 200
    d = r.json()
    assert d.get("ok") is True
    # must not leak existence of token
    assert d.get("dev_token") in (None, "", False) or "dev_token" not in d


def test_reset_password_flow_then_login_with_new_password():
    _tok, email = _register_fresh()
    # forgot
    f = requests.post(f"{API}/auth/forgot-password", json={"email": email}, timeout=15).json()
    token = f["dev_token"]
    new_pw = "NewPass@9876"
    # reset
    r = requests.post(f"{API}/auth/reset-password", json={"token": token, "password": new_pw}, timeout=15)
    assert r.status_code == 200
    # login with new pw
    l = requests.post(f"{API}/auth/login", json={"email": email, "password": new_pw}, timeout=15)
    assert l.status_code == 200
    # reuse same token should fail
    r2 = requests.post(f"{API}/auth/reset-password", json={"token": token, "password": "Another@123"}, timeout=15)
    assert r2.status_code == 400
    # invalid token
    r3 = requests.post(f"{API}/auth/reset-password", json={"token": "garbage_invalid_token", "password": "Another@123"}, timeout=15)
    assert r3.status_code == 400


# -------- Advance booking window --------
def _today_offset(days):
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()


def test_book_past_session_rejected(fresh_member):
    tok, _ = fresh_member
    classes = requests.get(f"{API}/classes", timeout=15).json()
    r = requests.post(f"{API}/classes/book",
                      json={"class_id": classes[0]["id"], "session_date": _today_offset(-1)},
                      headers=_h(tok), timeout=15)
    assert r.status_code == 400
    assert "past" in r.text.lower()


def test_book_beyond_3_days_rejected(fresh_member):
    tok, _ = fresh_member
    classes = requests.get(f"{API}/classes", timeout=15).json()
    r = requests.post(f"{API}/classes/book",
                      json={"class_id": classes[0]["id"], "session_date": _today_offset(4)},
                      headers=_h(tok), timeout=15)
    assert r.status_code == 400
    assert "3 days" in r.text.lower() or "advance" in r.text.lower()


def test_book_within_window_succeeds(fresh_member):
    tok, _ = fresh_member
    classes = requests.get(f"{API}/classes", timeout=15).json()
    # use a different class for each offset and clean up
    for offset, cls in zip([0, 3], classes[:2]):
        sd = _today_offset(offset)
        r = requests.post(f"{API}/classes/book",
                         json={"class_id": cls["id"], "session_date": sd},
                         headers=_h(tok), timeout=15)
        assert r.status_code == 200, f"offset={offset} → {r.status_code} {r.text}"
        assert r.json()["status"] in ("confirmed", "waitlist")
        bid = r.json()["id"]
        # cleanup
        requests.delete(f"{API}/classes/book/{bid}", headers=_h(tok), timeout=15)


# -------- PDF invoice --------
def test_invoice_pdf_for_successful_payment(fresh_member):
    tok, _ = fresh_member
    dash = requests.get(f"{API}/dashboard/me", headers=_h(tok), timeout=15).json()
    assert dash["payments"], "fresh_member should have a successful payment"
    pid = dash["payments"][0]["id"]
    r = requests.get(f"{API}/payments/{pid}/invoice.pdf", headers=_h(tok), timeout=30)
    assert r.status_code == 200, r.text
    assert r.headers.get("content-type", "").startswith("application/pdf")
    assert r.content[:8].startswith(b"%PDF-1.4")


def test_invoice_pdf_wrong_user_returns_404(fresh_member):
    _tok, _ = fresh_member
    # other user
    other_tok, _ = _register_fresh()
    dash = requests.get(f"{API}/dashboard/me", headers=_h(_tok), timeout=15).json()
    pid = dash["payments"][0]["id"]
    r = requests.get(f"{API}/payments/{pid}/invoice.pdf", headers=_h(other_tok), timeout=15)
    assert r.status_code == 404


def test_invoice_pdf_pending_returns_400():
    tok, _ = _register_fresh()
    plans = requests.get(f"{API}/plans", timeout=15).json()
    o = requests.post(f"{API}/subscribe/create-order",
                      json={"plan_id": plans[0]["id"], "payment_method": "upi"},
                      headers=_h(tok), timeout=15).json()
    r = requests.get(f"{API}/payments/{o['pending_payment_id']}/invoice.pdf",
                    headers=_h(tok), timeout=15)
    assert r.status_code == 400


# -------- Dashboard filter (only status=success) --------
def test_dashboard_payments_excludes_pending():
    tok, _ = _register_fresh()
    plans = requests.get(f"{API}/plans", timeout=15).json()
    # create a pending order (do not verify)
    requests.post(f"{API}/subscribe/create-order",
                  json={"plan_id": plans[0]["id"], "payment_method": "upi"},
                  headers=_h(tok), timeout=15)
    dash = requests.get(f"{API}/dashboard/me", headers=_h(tok), timeout=15).json()
    for p in dash["payments"]:
        assert p["status"] == "success", p


def test_admin_payments_excludes_pending(admin_token):
    # create a pending payment from a random user
    tok, _ = _register_fresh()
    plans = requests.get(f"{API}/plans", timeout=15).json()
    requests.post(f"{API}/subscribe/create-order",
                  json={"plan_id": plans[0]["id"], "payment_method": "upi"},
                  headers=_h(tok), timeout=15)
    r = requests.get(f"{API}/admin/payments", headers=_h(admin_token), timeout=20)
    assert r.status_code == 200
    for p in r.json():
        assert p["status"] == "success"
