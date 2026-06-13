"""Grind Station iteration 3 — Avatar upload via Emergent Object Storage + PWA static files."""
import io
import os
import uuid
import pytest
import requests
from PIL import Image

BASE_URL = os.environ.get(
    "REACT_APP_BACKEND_URL",
    "https://gym-membership-hub-24.preview.emergentagent.com",
).rstrip("/")
API = f"{BASE_URL}/api"

MEMBER = {"email": "member@grindstation.com", "password": "Member@Grind2026"}


# ---------- helpers ----------
def _login(creds):
    r = requests.post(f"{API}/auth/login", json=creds, timeout=30)
    assert r.status_code == 200, f"login failed: {r.status_code} {r.text}"
    return r.json()["access_token"]


def _h(tok):
    return {"Authorization": f"Bearer {tok}"}


def _make_jpeg(size_px=50, color="red"):
    buf = io.BytesIO()
    Image.new("RGB", (size_px, size_px), color).save(buf, "JPEG", quality=85)
    buf.seek(0)
    return buf.read()


def _make_png(size_px=50, color="blue"):
    buf = io.BytesIO()
    Image.new("RGBA", (size_px, size_px), color).save(buf, "PNG")
    buf.seek(0)
    return buf.read()


def _make_webp(size_px=50, color="green"):
    buf = io.BytesIO()
    Image.new("RGB", (size_px, size_px), color).save(buf, "WEBP", quality=85)
    buf.seek(0)
    return buf.read()


@pytest.fixture(scope="module")
def fresh_user_token():
    """Register a fresh user for avatar tests (avoid mutating seeded member long-term)."""
    payload = {
        "name": "TEST Avatar User",
        "email": f"test_avatar_{uuid.uuid4().hex[:8]}@example.com",
        "mobile": "+911234567890",
        "password": "Pass@1234",
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=30)
    assert r.status_code == 200, r.text
    return r.json()["access_token"], r.json()["user"]["id"]


@pytest.fixture(scope="module")
def member_token():
    return _login(MEMBER)


# ---------- Avatar Upload (POST /api/me/avatar) ----------
def test_avatar_upload_requires_auth():
    files = {"file": ("a.jpg", _make_jpeg(), "image/jpeg")}
    r = requests.post(f"{API}/me/avatar", files=files, timeout=15)
    assert r.status_code == 401, f"expected 401 got {r.status_code} {r.text}"


def test_avatar_upload_valid_jpeg(fresh_user_token):
    tok, uid = fresh_user_token
    files = {"file": ("a.jpg", _make_jpeg(), "image/jpeg")}
    r = requests.post(f"{API}/me/avatar", files=files, headers=_h(tok), timeout=30)
    assert r.status_code == 200, f"upload failed: {r.status_code} {r.text}"
    data = r.json()
    assert "avatar_path" in data and isinstance(data["avatar_path"], str) and len(data["avatar_path"]) > 0
    assert data["avatar_url"] == f"/api/me/avatar/{uid}"


def test_avatar_upload_valid_png(fresh_user_token):
    tok, _ = fresh_user_token
    files = {"file": ("a.png", _make_png(), "image/png")}
    r = requests.post(f"{API}/me/avatar", files=files, headers=_h(tok), timeout=30)
    assert r.status_code == 200, r.text
    assert "avatar_path" in r.json()


def test_avatar_upload_valid_webp(fresh_user_token):
    tok, _ = fresh_user_token
    files = {"file": ("a.webp", _make_webp(), "image/webp")}
    r = requests.post(f"{API}/me/avatar", files=files, headers=_h(tok), timeout=30)
    assert r.status_code == 200, r.text
    assert "avatar_path" in r.json()


# ---------- Avatar validation ----------
def test_avatar_reject_invalid_content_type(fresh_user_token):
    tok, _ = fresh_user_token
    files = {"file": ("a.gif", b"GIF89a" + b"\x00" * 100, "image/gif")}
    r = requests.post(f"{API}/me/avatar", files=files, headers=_h(tok), timeout=15)
    assert r.status_code == 400
    assert "JPEG" in r.text or "PNG" in r.text or "WebP" in r.text


def test_avatar_reject_text_file(fresh_user_token):
    tok, _ = fresh_user_token
    files = {"file": ("a.txt", b"plain text", "text/plain")}
    r = requests.post(f"{API}/me/avatar", files=files, headers=_h(tok), timeout=15)
    assert r.status_code == 400


def test_avatar_reject_oversized(fresh_user_token):
    tok, _ = fresh_user_token
    # Build > 2MB JPEG by using very large random-ish image
    big = io.BytesIO()
    # 3000x3000 with random pattern compresses; force size by appending raw bytes-like noise
    img = Image.new("RGB", (3000, 3000))
    # Create noise via putdata
    import os as _os
    img.frombytes(_os.urandom(3000 * 3000 * 3))
    img.save(big, "JPEG", quality=100)
    payload = big.getvalue()
    # If somehow under 2MB, pad — but we keep content-type jpeg so validation order still hits size check
    if len(payload) < 2 * 1024 * 1024 + 1024:
        payload = payload + _os.urandom(2 * 1024 * 1024)
    files = {"file": ("big.jpg", payload, "image/jpeg")}
    r = requests.post(f"{API}/me/avatar", files=files, headers=_h(tok), timeout=60)
    assert r.status_code == 400, f"expected 400 oversize, got {r.status_code} {r.text[:200]}"
    assert "2MB" in r.text or "under" in r.text.lower()


def test_avatar_reject_empty_file(fresh_user_token):
    tok, _ = fresh_user_token
    files = {"file": ("empty.jpg", b"", "image/jpeg")}
    r = requests.post(f"{API}/me/avatar", files=files, headers=_h(tok), timeout=15)
    assert r.status_code == 400
    assert "empty" in r.text.lower()


# ---------- Avatar Fetch (GET /api/me/avatar/{id}) ----------
def test_avatar_fetch_public_no_auth(fresh_user_token):
    tok, uid = fresh_user_token
    # ensure an avatar is uploaded first
    files = {"file": ("a.jpg", _make_jpeg(), "image/jpeg")}
    up = requests.post(f"{API}/me/avatar", files=files, headers=_h(tok), timeout=30)
    assert up.status_code == 200
    # fetch without auth headers
    r = requests.get(f"{API}/me/avatar/{uid}", timeout=15)
    assert r.status_code == 200, r.text
    ct = r.headers.get("content-type", "")
    assert ct.startswith("image/"), f"unexpected content-type: {ct}"
    assert len(r.content) > 0


def test_avatar_fetch_wrong_user_returns_404():
    bogus_id = uuid.uuid4().hex
    r = requests.get(f"{API}/me/avatar/{bogus_id}", timeout=15)
    assert r.status_code == 404


# ---------- /api/auth/me includes avatar_url ----------
def test_me_includes_avatar_url_after_upload(fresh_user_token):
    tok, uid = fresh_user_token
    files = {"file": ("a.jpg", _make_jpeg(), "image/jpeg")}
    up = requests.post(f"{API}/me/avatar", files=files, headers=_h(tok), timeout=30)
    assert up.status_code == 200
    r = requests.get(f"{API}/auth/me", headers=_h(tok), timeout=15)
    assert r.status_code == 200
    assert r.json().get("avatar_url") == f"/api/me/avatar/{uid}"


def test_me_avatar_url_null_for_fresh_user():
    payload = {
        "name": "TEST NoAvatar",
        "email": f"test_noavatar_{uuid.uuid4().hex[:8]}@example.com",
        "mobile": "+911234567890",
        "password": "Pass@1234",
    }
    r = requests.post(f"{API}/auth/register", json=payload, timeout=30)
    assert r.status_code == 200
    tok = r.json()["access_token"]
    me = requests.get(f"{API}/auth/me", headers=_h(tok), timeout=15)
    assert me.status_code == 200
    assert "avatar_url" in me.json(), "avatar_url key must be present"
    assert me.json()["avatar_url"] is None


# ---------- Avatar Delete (DELETE /api/me/avatar) ----------
def test_avatar_delete_requires_auth():
    r = requests.delete(f"{API}/me/avatar", timeout=15)
    assert r.status_code == 401


def test_avatar_delete_flow_clears_avatar():
    # Register fresh user (isolated from module fixture)
    payload = {
        "name": "TEST DelAvatar",
        "email": f"test_del_{uuid.uuid4().hex[:8]}@example.com",
        "mobile": "+911234567890",
        "password": "Pass@1234",
    }
    rr = requests.post(f"{API}/auth/register", json=payload, timeout=30)
    assert rr.status_code == 200
    tok = rr.json()["access_token"]
    uid = rr.json()["user"]["id"]

    # upload
    files = {"file": ("a.jpg", _make_jpeg(), "image/jpeg")}
    up = requests.post(f"{API}/me/avatar", files=files, headers=_h(tok), timeout=30)
    assert up.status_code == 200

    # delete
    d = requests.delete(f"{API}/me/avatar", headers=_h(tok), timeout=15)
    assert d.status_code == 200, d.text
    assert d.json().get("ok") is True

    # subsequent GET avatar → 404
    g = requests.get(f"{API}/me/avatar/{uid}", timeout=15)
    assert g.status_code == 404

    # /api/auth/me avatar_url → null
    me = requests.get(f"{API}/auth/me", headers=_h(tok), timeout=15)
    assert me.status_code == 200
    assert me.json().get("avatar_url") is None


# ---------- PWA static files (served by frontend / preview host) ----------
def test_pwa_manifest_json():
    # frontend static — same preview host, no /api prefix
    r = requests.get(f"{BASE_URL}/manifest.json", timeout=15)
    assert r.status_code == 200, r.text
    # content-type may be application/json or application/manifest+json
    ct = r.headers.get("content-type", "")
    assert "json" in ct.lower() or "manifest" in ct.lower()
    data = r.json()
    assert data.get("name") == "The Grind Station", f"unexpected name: {data.get('name')}"


def test_pwa_service_worker_js():
    r = requests.get(f"{BASE_URL}/sw.js", timeout=15)
    assert r.status_code == 200
    ct = r.headers.get("content-type", "").lower()
    assert "javascript" in ct or "ecmascript" in ct or "text" in ct, f"unexpected ct: {ct}"
    assert len(r.text) > 0


def test_pwa_icon_192_png():
    r = requests.get(f"{BASE_URL}/icon-192.png", timeout=15)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/png")
    assert len(r.content) > 0


def test_pwa_icon_512_png():
    r = requests.get(f"{BASE_URL}/icon-512.png", timeout=15)
    assert r.status_code == 200
    assert r.headers.get("content-type", "").startswith("image/png")
    assert len(r.content) > 0


def test_pwa_icon_svg():
    r = requests.get(f"{BASE_URL}/icon.svg", timeout=15)
    assert r.status_code == 200
    # svg may be served as image/svg+xml
    ct = r.headers.get("content-type", "").lower()
    assert "svg" in ct or "xml" in ct, f"unexpected ct: {ct}"
