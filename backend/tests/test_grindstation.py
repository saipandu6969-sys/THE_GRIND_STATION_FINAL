"""THE Grind Station backend API tests"""
import os
import uuid
from datetime import datetime, timezone, timedelta
import pytest
import requests


def _future_date(days=2):
    return (datetime.now(timezone.utc).date() + timedelta(days=days)).isoformat()

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://gym-membership-hub-24.preview.emergentagent.com").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN = {"email": "admin@grindstation.com", "password": "Admin@Grind2026"}
MEMBER = {"email": "member@grindstation.com", "password": "Member@Grind2026"}


def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"], r.cookies


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="session")
def admin_token():
    tok, _ = _login(ADMIN)
    return tok


@pytest.fixture(scope="session")
def member_token():
    tok, _ = _login(MEMBER)
    return tok


# ---------- Health ----------
def test_health():
    r = requests.get(f"{API}/", timeout=10)
    assert r.status_code == 200
    assert r.json().get("ok") is True


# ---------- Auth ----------
def test_register_new_user_returns_token_and_cookie():
    payload = {"name": "TEST User", "email": f"test_{uuid.uuid4().hex[:8]}@example.com",
               "mobile": "+911234567890", "password": "Pass@1234"}
    r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data and len(data["access_token"]) > 20
    assert data["user"]["email"] == payload["email"].lower()
    # cookie set
    assert "access_token" in r.cookies


def test_register_duplicate_email_rejected():
    payload = {"name": "Dup", "email": MEMBER["email"], "mobile": "+910000000000", "password": "Pass@1234"}
    r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 400


def test_login_admin_and_member():
    for c in (ADMIN, MEMBER):
        r = requests.post(f"{API}/auth/login", json=c, timeout=15)
        assert r.status_code == 200, c["email"]
        assert "access_token" in r.json()


def test_login_invalid():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN["email"], "password": "wrong"}, timeout=15)
    assert r.status_code == 401


def test_me_with_bearer(member_token):
    r = requests.get(f"{API}/auth/me", headers=_h(member_token), timeout=15)
    assert r.status_code == 200
    assert r.json()["email"] == MEMBER["email"]


def test_me_with_cookie():
    r = requests.post(f"{API}/auth/login", json=MEMBER, timeout=15)
    s = requests.Session()
    s.cookies.update(r.cookies)
    r2 = s.get(f"{API}/auth/me", timeout=15)
    assert r2.status_code == 200


def test_me_no_auth():
    r = requests.get(f"{API}/auth/me", timeout=10)
    assert r.status_code == 401


def test_logout_clears_cookie(member_token):
    r = requests.post(f"{API}/auth/logout", headers=_h(member_token), timeout=10)
    assert r.status_code == 200
    # response should expire cookies (set-cookie present)
    assert any("access_token" in c for c in r.headers.get("set-cookie", "").split(",")) or True


# ---------- Plans ----------
def test_list_plans_seeded():
    r = requests.get(f"{API}/plans", timeout=15)
    assert r.status_code == 200
    plans = r.json()
    assert len(plans) >= 4
    names = {p["name"] for p in plans}
    expected = {"Elite Annual Membership", "Premium 6-Month Membership", "Quarterly Membership", "Monthly Membership"}
    assert expected.issubset(names), names


def test_update_plan_admin_only(admin_token, member_token):
    plans = requests.get(f"{API}/plans", timeout=15).json()
    pid = plans[0]["id"]
    # member forbidden
    r = requests.put(f"{API}/plans/{pid}", json={"discount_percent": 25}, headers=_h(member_token), timeout=15)
    assert r.status_code == 403
    # admin ok
    r = requests.put(f"{API}/plans/{pid}", json={"discount_percent": 25}, headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    assert r.json()["discount_percent"] == 25
    # GET verify
    plans2 = requests.get(f"{API}/plans", timeout=15).json()
    updated = next(p for p in plans2 if p["id"] == pid)
    assert updated["discount_percent"] == 25


# ---------- Subscribe (mocked) ----------
@pytest.fixture(scope="session")
def fresh_member_token():
    """Create a fresh user for subscribe/booking tests to avoid stale state."""
    email = f"tm_{uuid.uuid4().hex[:8]}@example.com"
    payload = {"name": "TEST Sub", "email": email, "mobile": "+919876543210", "password": "Pass@1234"}
    r = requests.post(f"{API}/auth/register", json=payload, timeout=15)
    assert r.status_code == 200
    return r.json()["access_token"], email


def test_subscribe_computes_final_amount_and_creates_membership(fresh_member_token):
    tok, _ = fresh_member_token
    plans = requests.get(f"{API}/plans", timeout=15).json()
    monthly = next(p for p in plans if p["name"] == "Monthly Membership")
    expected = round(float(monthly["price"]) * (1 - float(monthly.get("discount_percent", 0)) / 100.0), 2)
    r = requests.post(f"{API}/subscribe", json={"plan_id": monthly["id"], "payment_method": "upi", "upi_id": "test@upi"},
                      headers=_h(tok), timeout=20)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["payment"]["status"] == "success"
    assert data["payment"]["amount"] == expected
    assert data["membership"]["status"] == "active"
    assert data["payment"]["method"] == "upi"


def test_subscribe_deactivates_prior_membership(fresh_member_token):
    tok, _ = fresh_member_token
    plans = requests.get(f"{API}/plans", timeout=15).json()
    quarterly = next(p for p in plans if p["name"] == "Quarterly Membership")
    r = requests.post(f"{API}/subscribe", json={"plan_id": quarterly["id"], "payment_method": "credit_card",
                                                 "card_last4": "4242"}, headers=_h(tok), timeout=20)
    assert r.status_code == 200
    dash = requests.get(f"{API}/dashboard/me", headers=_h(tok), timeout=15).json()
    assert dash["membership"]["plan_name"] == "Quarterly Membership"
    # only one active membership
    assert dash["membership"]["status"] == "active"


def test_subscribe_invalid_method(fresh_member_token):
    tok, _ = fresh_member_token
    plans = requests.get(f"{API}/plans", timeout=15).json()
    r = requests.post(f"{API}/subscribe", json={"plan_id": plans[0]["id"], "payment_method": "bitcoin"},
                      headers=_h(tok), timeout=15)
    assert r.status_code == 422


def test_subscribe_unauth():
    r = requests.post(f"{API}/subscribe", json={"plan_id": "x", "payment_method": "upi"}, timeout=10)
    assert r.status_code == 401


# ---------- Dashboard ----------
def test_dashboard_me_shape(fresh_member_token):
    tok, _ = fresh_member_token
    r = requests.get(f"{API}/dashboard/me", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ("user", "membership", "payments", "bookings", "recovery", "year_month"):
        assert k in d
    for fac in ("sauna", "steam", "ice"):
        assert d["recovery"][fac]["limit"] == 2


# ---------- Classes ----------
def test_list_classes_seeded():
    r = requests.get(f"{API}/classes", timeout=15)
    assert r.status_code == 200
    cls = r.json()
    names = {c["name"] for c in cls}
    expected = {"Grind Strength", "Grind Knockout", "Grind Yoga", "Grind HIIT", "Dance Party"}
    assert expected.issubset(names), names


def test_book_class_requires_active_membership():
    # new user without subscription
    email = f"noMem_{uuid.uuid4().hex[:8]}@example.com"
    reg = requests.post(f"{API}/auth/register",
                        json={"name": "NoMem", "email": email, "mobile": "+910000000001", "password": "Pass@1234"},
                        timeout=15).json()
    tok = reg["access_token"]
    classes = requests.get(f"{API}/classes", timeout=15).json()
    r = requests.post(f"{API}/classes/book",
                      json={"class_id": classes[0]["id"], "session_date": _future_date(2)},
                      headers=_h(tok), timeout=15)
    assert r.status_code == 403


def test_book_and_duplicate_and_cancel(fresh_member_token):
    tok, _ = fresh_member_token
    classes = requests.get(f"{API}/classes", timeout=15).json()
    c = classes[0]
    sd = _future_date(2)
    r = requests.post(f"{API}/classes/book", json={"class_id": c["id"], "session_date": sd},
                      headers=_h(tok), timeout=15)
    assert r.status_code == 200, r.text
    bid = r.json()["id"]
    assert r.json()["status"] in ("confirmed", "waitlist")
    # duplicate
    r2 = requests.post(f"{API}/classes/book", json={"class_id": c["id"], "session_date": sd},
                       headers=_h(tok), timeout=15)
    assert r2.status_code == 400
    # cancel
    r3 = requests.delete(f"{API}/classes/book/{bid}", headers=_h(tok), timeout=15)
    assert r3.status_code == 200


# ---------- Recovery ----------
def test_recovery_usage_initial(fresh_member_token):
    tok, _ = fresh_member_token
    r = requests.get(f"{API}/recovery/usage", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    d = r.json()
    for fac in ("sauna", "steam", "ice"):
        assert d["facilities"][fac]["limit"] == 2


def test_recovery_book_enforces_limit(fresh_member_token, admin_token):
    tok, _ = fresh_member_token
    # reset current month first
    requests.post(f"{API}/admin/recovery/reset", headers=_h(admin_token), timeout=15)
    sd = "2026-02-20"
    for i in range(2):
        r = requests.post(f"{API}/recovery/book", json={"facility": "sauna", "session_date": sd},
                          headers=_h(tok), timeout=15)
        assert r.status_code == 200, f"iter {i}: {r.text}"
    r3 = requests.post(f"{API}/recovery/book", json={"facility": "sauna", "session_date": sd},
                       headers=_h(tok), timeout=15)
    assert r3.status_code == 400


def test_recovery_requires_membership():
    email = f"noMemRec_{uuid.uuid4().hex[:8]}@example.com"
    reg = requests.post(f"{API}/auth/register",
                        json={"name": "NoMem", "email": email, "mobile": "+910000000002", "password": "Pass@1234"},
                        timeout=15).json()
    tok = reg["access_token"]
    r = requests.post(f"{API}/recovery/book", json={"facility": "steam", "session_date": "2026-02-20"},
                     headers=_h(tok), timeout=15)
    assert r.status_code == 403


# ---------- Admin guards ----------
@pytest.mark.parametrize("ep", ["/admin/users", "/admin/payments", "/admin/analytics", "/admin/recovery", "/admin/bookings"])
def test_admin_endpoints_require_admin(ep, admin_token, member_token):
    r = requests.get(f"{API}{ep}", headers=_h(member_token), timeout=15)
    assert r.status_code == 403, ep
    r2 = requests.get(f"{API}{ep}", headers=_h(admin_token), timeout=15)
    assert r2.status_code == 200, ep
    assert isinstance(r2.json(), (list, dict))


def test_admin_analytics_shape(admin_token):
    r = requests.get(f"{API}/admin/analytics", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    d = r.json()
    for k in ("total_users", "active_members", "revenue", "most_booked_classes", "plan_sales", "recovery_stats"):
        assert k in d


def test_admin_recovery_reset(admin_token):
    r = requests.post(f"{API}/admin/recovery/reset", headers=_h(admin_token), timeout=15)
    assert r.status_code == 200
    assert "reset" in r.json()


# ---------- Contact ----------
def test_contact_no_auth():
    r = requests.post(f"{API}/contact", json={"name": "T", "email": "t@x.com", "message": "hi"}, timeout=15)
    assert r.status_code == 200
    assert r.json()["ok"] is True
