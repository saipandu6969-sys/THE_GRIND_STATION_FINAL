from dotenv import load_dotenv
from pathlib import Path
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import uuid
import logging
import secrets
from datetime import datetime, timezone, timedelta
from typing import List, Optional, Literal
from contextlib import asynccontextmanager

import bcrypt
import hmac
import hashlib
import requests
import jwt as pyjwt
from io import BytesIO
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Response, status, UploadFile, File, Header, Query
from fastapi.responses import StreamingResponse
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, EmailStr, ConfigDict

try:
    import razorpay  # type: ignore
except Exception:
    razorpay = None  # type: ignore

# ---------- DB ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGO = "HS256"
ACCESS_MIN = 60 * 8  # 8h
REFRESH_DAYS = 7

# ---------- Object Storage ----------
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY", "")
APP_NAME = "grindstation"
_storage_key = None

def init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    if not EMERGENT_KEY:
        raise HTTPException(500, "Object storage not configured")
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key, "Content-Type": content_type},
                        data=data, timeout=120)
    if resp.status_code == 403:
        # refresh and retry once
        globals()['_storage_key'] = None
        key = init_storage()
        resp = requests.put(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key, "Content-Type": content_type},
                            data=data, timeout=120)
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                        headers={"X-Storage-Key": key}, timeout=60)
    if resp.status_code == 403:
        globals()['_storage_key'] = None
        key = init_storage()
        resp = requests.get(f"{STORAGE_URL}/objects/{path}",
                            headers={"X-Storage-Key": key}, timeout=60)
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# ---------- Razorpay (with mock fallback) ----------
RAZORPAY_KEY_ID = os.environ.get("RAZORPAY_KEY_ID", "").strip()
RAZORPAY_KEY_SECRET = os.environ.get("RAZORPAY_KEY_SECRET", "").strip()
RAZORPAY_ENABLED = bool(RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET and razorpay is not None)
rzp_client = razorpay.Client(auth=(RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET)) if RAZORPAY_ENABLED else None

# ---------- Email (console logger fallback) ----------
def send_email(to: str, subject: str, body: str):
    """Email stub. Logs to console. Plug Resend/SendGrid here when keys provided."""
    logger.info(f"[EMAIL → {to}] {subject}\n{body}\n---")

logger = logging.getLogger("grindstation")
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')

# ---------- Utils ----------
def utcnow():
    return datetime.now(timezone.utc)

def iso(dt: datetime) -> str:
    return dt.isoformat()

def hash_password(pw: str) -> str:
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt()).decode()

def verify_password(pw: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(pw.encode(), hashed.encode())
    except Exception:
        return False

def create_token(sub: str, email: str, role: str, ttype: str = "access") -> str:
    if ttype == "access":
        exp = utcnow() + timedelta(minutes=ACCESS_MIN)
    else:
        exp = utcnow() + timedelta(days=REFRESH_DAYS)
    payload = {"sub": sub, "email": email, "role": role, "type": ttype, "exp": exp}
    return pyjwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGO)

def set_auth_cookies(response: Response, access: str, refresh: str):
    response.set_cookie("access_token", access, httponly=True, secure=False, samesite="lax",
                        max_age=ACCESS_MIN * 60, path="/")
    response.set_cookie("refresh_token", refresh, httponly=True, secure=False, samesite="lax",
                        max_age=REFRESH_DAYS * 86400, path="/")

def clear_auth_cookies(response: Response):
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("refresh_token", path="/")

def public_user(u: dict) -> dict:
    return {
        "id": u["id"],
        "email": u["email"],
        "name": u.get("name", ""),
        "mobile": u.get("mobile", ""),
        "role": u.get("role", "user"),
        "created_at": u.get("created_at"),
        "avatar_url": f"/api/me/avatar/{u['id']}" if u.get("avatar_path") else None,
    }

async def get_current_user(request: Request) -> dict:
    token = request.cookies.get("access_token")
    if not token:
        auth = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth[7:]
    if not token:
        raise HTTPException(401, "Not authenticated")
    try:
        payload = pyjwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGO])
        if payload.get("type") != "access":
            raise HTTPException(401, "Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0})
        if not user:
            raise HTTPException(401, "User not found")
        return user
    except pyjwt.ExpiredSignatureError:
        raise HTTPException(401, "Token expired")
    except pyjwt.InvalidTokenError:
        raise HTTPException(401, "Invalid token")

async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(403, "Admin only")
    return user

# ---------- Models ----------
class RegisterIn(BaseModel):
    name: str
    email: EmailStr
    mobile: str
    password: str = Field(min_length=6)

class LoginIn(BaseModel):
    email: EmailStr
    password: str

class PlanIn(BaseModel):
    name: str
    price: float
    duration_months: int
    extension_days: int = 0
    discount_percent: int = 0
    features: List[str] = []
    active: bool = True
    popular: bool = False

class PlanUpdate(BaseModel):
    name: Optional[str] = None
    price: Optional[float] = None
    duration_months: Optional[int] = None
    extension_days: Optional[int] = None
    discount_percent: Optional[int] = None
    features: Optional[List[str]] = None
    active: Optional[bool] = None
    popular: Optional[bool] = None

class SubscribeIn(BaseModel):
    plan_id: str
    payment_method: Literal["upi", "debit_card", "credit_card"]
    # mock card/upi details (not stored)
    card_last4: Optional[str] = None
    upi_id: Optional[str] = None

class ClassIn(BaseModel):
    name: str
    description: str
    trainer: str
    day_of_week: str  # Mon..Sun
    start_time: str   # HH:MM
    duration_minutes: int
    difficulty: Literal["Beginner", "Intermediate", "Advanced"]
    capacity: int
    image_url: Optional[str] = None

class ClassUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    trainer: Optional[str] = None
    day_of_week: Optional[str] = None
    start_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    difficulty: Optional[str] = None
    capacity: Optional[int] = None
    image_url: Optional[str] = None
    active: Optional[bool] = None

class BookClassIn(BaseModel):
    class_id: str
    session_date: str  # YYYY-MM-DD

class RecoveryBookIn(BaseModel):
    facility: Literal["sauna", "steam", "ice"]
    session_date: str  # YYYY-MM-DD

class ContactIn(BaseModel):
    name: str
    email: EmailStr
    message: str
    phone: Optional[str] = None

# ---------- Seeders ----------
DEFAULT_PLANS = [
    {"name": "Elite Annual Membership", "price": 19999, "duration_months": 12, "extension_days": 30,
     "discount_percent": 20, "features": ["Full Gym Access", "Group Classes", "Recovery Zone Access", "1 Month Extension"], "popular": True},
    {"name": "Premium 6-Month Membership", "price": 12999, "duration_months": 6, "extension_days": 30,
     "discount_percent": 15, "features": ["Full Gym Access", "Group Classes", "Recovery Zone Access", "1 Month Extension"]},
    {"name": "Quarterly Membership", "price": 9999, "duration_months": 3, "extension_days": 15,
     "discount_percent": 10, "features": ["Full Gym Access", "Group Classes", "Recovery Zone Access", "15 Days Extension"]},
    {"name": "Monthly Membership", "price": 4000, "duration_months": 1, "extension_days": 0,
     "discount_percent": 5, "features": ["Full Gym Access", "Group Classes", "Recovery Zone Access"]},
]

DEFAULT_CLASSES = [
    {"name": "Grind Strength", "description": "Heavy compound lifts. Build raw power.",
     "trainer": "Coach Vikram", "day_of_week": "Mon", "start_time": "07:00", "duration_minutes": 60,
     "difficulty": "Advanced", "capacity": 12,
     "image_url": "https://images.unsplash.com/photo-1722925541142-5db2668ca492?w=800"},
    {"name": "Grind Knockout", "description": "Boxing-focused HIIT. Punch through your limits.",
     "trainer": "Coach Arjun", "day_of_week": "Tue", "start_time": "18:30", "duration_minutes": 50,
     "difficulty": "Intermediate", "capacity": 16,
     "image_url": "https://images.unsplash.com/photo-1608202409296-a9cad928dd2f?w=800"},
    {"name": "Grind Yoga", "description": "Mobility, breath, recovery. Reset the body.",
     "trainer": "Coach Maya", "day_of_week": "Wed", "start_time": "06:30", "duration_minutes": 60,
     "difficulty": "Beginner", "capacity": 20,
     "image_url": "https://images.unsplash.com/photo-1599901860904-17e6ed7083a0?w=800"},
    {"name": "Grind HIIT", "description": "20 minutes of pure intensity. Burn fast.",
     "trainer": "Coach Riya", "day_of_week": "Thu", "start_time": "19:00", "duration_minutes": 30,
     "difficulty": "Intermediate", "capacity": 18,
     "image_url": "https://images.unsplash.com/photo-1517836357463-d25dfeac3438?w=800"},
    {"name": "Dance Party", "description": "Cardio that doesn't feel like cardio. Sweat with the beat.",
     "trainer": "Coach Neha", "day_of_week": "Sat", "start_time": "17:00", "duration_minutes": 60,
     "difficulty": "Beginner", "capacity": 25,
     "image_url": "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?w=800"},
]

async def seed_data():
    # indexes
    await db.users.create_index("email", unique=True)
    await db.users.create_index("id", unique=True)
    await db.plans.create_index("id", unique=True)
    await db.classes.create_index("id", unique=True)
    await db.memberships.create_index("user_id")
    await db.payments.create_index("user_id")
    await db.class_bookings.create_index([("user_id", 1), ("class_id", 1), ("session_date", 1)])
    await db.recovery_usage.create_index([("user_id", 1), ("facility", 1), ("year_month", 1)], unique=True)

    # admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@grindstation.com")
    admin_password = os.environ.get("ADMIN_PASSWORD", "Admin@Grind2026")
    existing = await db.users.find_one({"email": admin_email})
    if not existing:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": admin_email, "name": "Grind Admin", "mobile": "+910000000000",
            "password_hash": hash_password(admin_password), "role": "admin",
            "created_at": iso(utcnow()),
        })
    else:
        if not verify_password(admin_password, existing.get("password_hash", "")):
            await db.users.update_one({"email": admin_email},
                                      {"$set": {"password_hash": hash_password(admin_password)}})

    # test member
    member_email = "member@grindstation.com"
    if not await db.users.find_one({"email": member_email}):
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": member_email, "name": "Test Member", "mobile": "+919999999999",
            "password_hash": hash_password("Member@Grind2026"), "role": "user",
            "created_at": iso(utcnow()),
        })

    # plans
    if await db.plans.count_documents({}) == 0:
        for p in DEFAULT_PLANS:
            await db.plans.insert_one({"id": str(uuid.uuid4()), "active": True, "popular": p.get("popular", False),
                                       **{k: v for k, v in p.items() if k != "popular"},
                                       "created_at": iso(utcnow())})
    # classes
    if await db.classes.count_documents({}) == 0:
        for c in DEFAULT_CLASSES:
            await db.classes.insert_one({"id": str(uuid.uuid4()), "active": True, **c,
                                         "created_at": iso(utcnow())})

# ---------- Lifespan ----------
@asynccontextmanager
async def lifespan(app: FastAPI):
    await seed_data()
    yield
    client.close()

app = FastAPI(lifespan=lifespan)
api = APIRouter(prefix="/api")

# ---------- Auth Routes ----------
@api.post("/auth/register")
async def register(body: RegisterIn, response: Response):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(400, "Email already registered")
    uid = str(uuid.uuid4())
    doc = {"id": uid, "email": email, "name": body.name, "mobile": body.mobile,
           "password_hash": hash_password(body.password), "role": "user",
           "created_at": iso(utcnow())}
    await db.users.insert_one(doc)
    access = create_token(uid, email, "user", "access")
    refresh = create_token(uid, email, "user", "refresh")
    set_auth_cookies(response, access, refresh)
    return {"user": public_user(doc), "access_token": access}

@api.post("/auth/login")
async def login(body: LoginIn, response: Response):
    email = body.email.lower()
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(401, "Invalid email or password")
    access = create_token(user["id"], email, user.get("role", "user"), "access")
    refresh = create_token(user["id"], email, user.get("role", "user"), "refresh")
    set_auth_cookies(response, access, refresh)
    return {"user": public_user(user), "access_token": access}

@api.post("/auth/logout")
async def logout(response: Response):
    clear_auth_cookies(response)
    return {"ok": True}

# ---------- Forgot / Reset Password ----------
class ForgotIn(BaseModel):
    email: EmailStr

class ResetIn(BaseModel):
    token: str
    password: str = Field(min_length=6)

@api.post("/auth/forgot-password")
async def forgot_password(body: ForgotIn):
    email = body.email.lower()
    user = await db.users.find_one({"email": email})
    # always respond 200 (don't leak which emails exist)
    if user:
        token = secrets.token_urlsafe(32)
        expires = utcnow() + timedelta(hours=1)
        await db.password_reset_tokens.insert_one({
            "id": str(uuid.uuid4()), "user_id": user["id"], "token": token,
            "expires_at": expires, "used": False, "created_at": iso(utcnow()),
        })
        frontend_url = os.environ.get("FRONTEND_URL", "")
        reset_link = f"{frontend_url}/reset-password?token={token}" if frontend_url else f"/reset-password?token={token}"
        send_email(email, "Reset your Grind Station password",
                   f"Click this link to reset your password (valid 1 hour):\n{reset_link}\n\nIf you didn't request this, ignore this email.")
        # also return token in development so it's testable without email
        return {"ok": True, "dev_token": token if not os.environ.get("PROD") else None}
    return {"ok": True}

@api.post("/auth/reset-password")
async def reset_password(body: ResetIn):
    rec = await db.password_reset_tokens.find_one({"token": body.token})
    if not rec:
        raise HTTPException(400, "Invalid or expired token")
    if rec.get("used"):
        raise HTTPException(400, "Token already used")
    expires = rec["expires_at"]
    if isinstance(expires, str):
        expires = datetime.fromisoformat(expires)
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    if expires < utcnow():
        raise HTTPException(400, "Token expired")
    await db.users.update_one({"id": rec["user_id"]}, {"$set": {"password_hash": hash_password(body.password)}})
    await db.password_reset_tokens.update_one({"_id": rec["_id"]}, {"$set": {"used": True}})
    return {"ok": True}

@api.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return public_user(user)

# ---------- Avatar Upload ----------
ALLOWED_AVATAR_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_AVATAR_SIZE = 2 * 1024 * 1024  # 2MB

@api.post("/me/avatar")
async def upload_avatar(file: UploadFile = File(...), user: dict = Depends(get_current_user)):
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_AVATAR_TYPES:
        raise HTTPException(400, "Only JPEG, PNG or WebP allowed")
    data = await file.read()
    if len(data) > MAX_AVATAR_SIZE:
        raise HTTPException(400, "Avatar must be under 2MB")
    if len(data) == 0:
        raise HTTPException(400, "Empty file")
    ext = {"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp"}[content_type]
    path = f"{APP_NAME}/avatars/{user['id']}/{uuid.uuid4()}.{ext}"
    try:
        result = put_object(path, data, content_type)
    except requests.HTTPError as e:
        logger.error(f"Avatar upload failed: {e}")
        raise HTTPException(502, "Storage error")
    stored_path = result.get("path", path)
    await db.users.update_one({"id": user["id"]},
                              {"$set": {"avatar_path": stored_path, "avatar_content_type": content_type}})
    return {"avatar_path": stored_path, "avatar_url": f"/api/me/avatar/{user['id']}"}

@api.get("/me/avatar/{user_id}")
async def get_avatar(user_id: str, authorization: Optional[str] = Header(None), auth: Optional[str] = Query(None)):
    # Avatars are public (used in <img src=...>); no auth needed to view
    u = await db.users.find_one({"id": user_id}, {"_id": 0, "avatar_path": 1, "avatar_content_type": 1})
    if not u or not u.get("avatar_path"):
        raise HTTPException(404, "Avatar not found")
    try:
        data, ct = get_object(u["avatar_path"])
    except requests.HTTPError:
        raise HTTPException(404, "Avatar not found")
    return Response(content=data, media_type=u.get("avatar_content_type") or ct,
                    headers={"Cache-Control": "public, max-age=300"})

@api.delete("/me/avatar")
async def delete_avatar(user: dict = Depends(get_current_user)):
    await db.users.update_one({"id": user["id"]}, {"$unset": {"avatar_path": "", "avatar_content_type": ""}})
    return {"ok": True}

# ---------- Plans ----------
@api.get("/plans")
async def list_plans(all_plans: bool = False, user: Optional[dict] = None):
    q = {} if all_plans else {"active": True}
    plans = await db.plans.find(q, {"_id": 0}).to_list(100)
    plans.sort(key=lambda p: -p.get("price", 0))
    return plans

@api.post("/plans")
async def create_plan(body: PlanIn, admin: dict = Depends(require_admin)):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "created_at": iso(utcnow())}
    await db.plans.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/plans/{plan_id}")
async def update_plan(plan_id: str, body: PlanUpdate, admin: dict = Depends(require_admin)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(400, "No fields")
    res = await db.plans.update_one({"id": plan_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Plan not found")
    plan = await db.plans.find_one({"id": plan_id}, {"_id": 0})
    return plan

@api.delete("/plans/{plan_id}")
async def delete_plan(plan_id: str, admin: dict = Depends(require_admin)):
    res = await db.plans.delete_one({"id": plan_id})
    return {"deleted": res.deleted_count}

# ---------- Subscribe (Razorpay with mock fallback) ----------
@api.get("/payment/config")
async def payment_config():
    """Tells the frontend whether to use real Razorpay checkout or mock flow."""
    return {"razorpay_enabled": RAZORPAY_ENABLED, "key_id": RAZORPAY_KEY_ID if RAZORPAY_ENABLED else None}

@api.post("/subscribe/create-order")
async def create_order(body: SubscribeIn, user: dict = Depends(get_current_user)):
    plan = await db.plans.find_one({"id": body.plan_id, "active": True}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Plan not found or inactive")
    base = float(plan["price"])
    discount = float(plan.get("discount_percent", 0))
    final_amount = round(base * (1 - discount / 100.0), 2)
    amount_paise = int(final_amount * 100)
    receipt = f"GS{secrets.token_hex(6).upper()}"[:40]
    order = None
    if RAZORPAY_ENABLED:
        try:
            order = rzp_client.order.create({"amount": amount_paise, "currency": "INR",
                                             "payment_capture": 1, "receipt": receipt,
                                             "notes": {"user_id": user["id"], "plan_id": plan["id"]}})
        except Exception as e:
            logger.error(f"Razorpay order creation failed: {e}")
            raise HTTPException(502, "Payment gateway error")
    # store a pending payment record
    pending_id = str(uuid.uuid4())
    pending = {
        "id": pending_id, "user_id": user["id"], "plan_id": plan["id"], "plan_name": plan["name"],
        "amount": final_amount, "base_amount": base, "discount_percent": discount,
        "method": body.payment_method, "status": "pending",
        "razorpay_order_id": order["id"] if order else None,
        "receipt": receipt, "created_at": iso(utcnow()),
    }
    await db.payments.insert_one(pending)
    return {
        "pending_payment_id": pending_id,
        "razorpay_order_id": order["id"] if order else None,
        "razorpay_key_id": RAZORPAY_KEY_ID if RAZORPAY_ENABLED else None,
        "amount_paise": amount_paise,
        "amount": final_amount,
        "currency": "INR",
        "plan_name": plan["name"],
        "razorpay_enabled": RAZORPAY_ENABLED,
    }

class VerifyPaymentIn(BaseModel):
    pending_payment_id: str
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    razorpay_signature: Optional[str] = None

@api.post("/subscribe/verify")
async def verify_payment(body: VerifyPaymentIn, user: dict = Depends(get_current_user)):
    pending = await db.payments.find_one({"id": body.pending_payment_id, "user_id": user["id"]}, {"_id": 0})
    if not pending:
        raise HTTPException(404, "Pending payment not found")
    if pending["status"] != "pending":
        raise HTTPException(400, f"Payment already {pending['status']}")
    # verify signature when Razorpay is enabled
    if RAZORPAY_ENABLED:
        if not (body.razorpay_order_id and body.razorpay_payment_id and body.razorpay_signature):
            raise HTTPException(400, "Missing Razorpay verification fields")
        msg = f"{body.razorpay_order_id}|{body.razorpay_payment_id}".encode()
        expected = hmac.new(RAZORPAY_KEY_SECRET.encode(), msg, hashlib.sha256).hexdigest()
        if not hmac.compare_digest(expected, body.razorpay_signature):
            await db.payments.update_one({"id": body.pending_payment_id}, {"$set": {"status": "failed"}})
            raise HTTPException(400, "Signature verification failed")
    # mark success
    invoice_no = f"GS-{datetime.now().strftime('%Y%m')}-{secrets.token_hex(3).upper()}"
    await db.payments.update_one({"id": body.pending_payment_id},
                                 {"$set": {"status": "success", "invoice_no": invoice_no,
                                           "razorpay_payment_id": body.razorpay_payment_id,
                                           "razorpay_signature": body.razorpay_signature,
                                           "paid_at": iso(utcnow())}})
    payment = await db.payments.find_one({"id": body.pending_payment_id}, {"_id": 0})
    plan = await db.plans.find_one({"id": payment["plan_id"]}, {"_id": 0})
    # create membership
    start = utcnow()
    months = int(plan["duration_months"])
    ext_days = int(plan.get("extension_days", 0))
    expiry = start + timedelta(days=months * 30 + ext_days)
    membership_doc = {
        "id": str(uuid.uuid4()), "user_id": user["id"],
        "plan_id": plan["id"], "plan_name": plan["name"],
        "start_date": iso(start), "expiry_date": iso(expiry),
        "extension_days": ext_days, "payment_id": payment["id"],
        "status": "active", "created_at": iso(start),
    }
    await db.memberships.update_many({"user_id": user["id"], "status": "active"}, {"$set": {"status": "expired"}})
    await db.memberships.insert_one(membership_doc)
    membership_doc.pop("_id", None)
    # send confirmation email (stub)
    send_email(user["email"], f"Welcome to {plan['name']}",
               f"Hi {user.get('name','Member')},\n\nYour membership is active until {expiry.strftime('%d %b %Y')}.\nInvoice: {invoice_no}\nAmount: ₹{payment['amount']:,.2f}\n\n— The Grind Station")
    return {"payment": payment, "membership": membership_doc}

# Legacy mock endpoint kept for backwards compatibility — still used when no Razorpay keys
@api.post("/subscribe")
async def subscribe(body: SubscribeIn, user: dict = Depends(get_current_user)):
    plan = await db.plans.find_one({"id": body.plan_id, "active": True}, {"_id": 0})
    if not plan:
        raise HTTPException(404, "Plan not found or inactive")
    base = float(plan["price"])
    discount = float(plan.get("discount_percent", 0))
    final_amount = round(base * (1 - discount / 100.0), 2)
    invoice_no = f"GS-{datetime.now().strftime('%Y%m')}-{secrets.token_hex(3).upper()}"
    payment_id = str(uuid.uuid4())
    pay_doc = {
        "id": payment_id, "user_id": user["id"], "plan_id": plan["id"], "plan_name": plan["name"],
        "amount": final_amount, "discount_percent": discount, "base_amount": base,
        "method": body.payment_method, "status": "success", "invoice_no": invoice_no,
        "created_at": iso(utcnow()),
    }
    await db.payments.insert_one(pay_doc)
    start = utcnow()
    months = int(plan["duration_months"])
    ext_days = int(plan.get("extension_days", 0))
    expiry = start + timedelta(days=months * 30 + ext_days)
    membership_doc = {
        "id": str(uuid.uuid4()), "user_id": user["id"],
        "plan_id": plan["id"], "plan_name": plan["name"],
        "start_date": iso(start), "expiry_date": iso(expiry),
        "extension_days": ext_days, "payment_id": payment_id,
        "status": "active", "created_at": iso(start),
    }
    await db.memberships.update_many({"user_id": user["id"], "status": "active"}, {"$set": {"status": "expired"}})
    await db.memberships.insert_one(membership_doc)
    pay_doc.pop("_id", None)
    membership_doc.pop("_id", None)
    send_email(user["email"], f"Welcome to {plan['name']}",
               f"Hi {user.get('name','Member')},\n\nYour membership is active until {expiry.strftime('%d %b %Y')}.\nInvoice: {invoice_no}\n\n— The Grind Station")
    return {"payment": pay_doc, "membership": membership_doc}

# ---------- Dashboard ----------
@api.get("/dashboard/me")
async def dashboard_me(user: dict = Depends(get_current_user)):
    membership = await db.memberships.find_one(
        {"user_id": user["id"], "status": "active"}, {"_id": 0}, sort=[("created_at", -1)])
    payments = await db.payments.find({"user_id": user["id"], "status": "success"}, {"_id": 0}).sort("created_at", -1).to_list(50)
    bookings = await db.class_bookings.find({"user_id": user["id"]}, {"_id": 0}).sort("session_date", -1).to_list(50)
    # recovery usage for current month
    ym = utcnow().strftime("%Y-%m")
    recov = {}
    for fac in ["sauna", "steam", "ice"]:
        rec = await db.recovery_usage.find_one({"user_id": user["id"], "facility": fac, "year_month": ym}, {"_id": 0})
        recov[fac] = {"used": rec["count"] if rec else 0, "limit": 2, "sessions": rec.get("sessions", []) if rec else []}
    return {"user": public_user(user), "membership": membership, "payments": payments,
            "bookings": bookings, "recovery": recov, "year_month": ym}

@api.get("/payments/{payment_id}/invoice")
async def get_invoice(payment_id: str, user: dict = Depends(get_current_user)):
    p = await db.payments.find_one({"id": payment_id, "user_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Invoice not found")
    return p

@api.get("/payments/{payment_id}/invoice.pdf")
async def get_invoice_pdf(payment_id: str, user: dict = Depends(get_current_user)):
    from io import BytesIO
    from reportlab.lib.pagesizes import A4
    from reportlab.lib import colors
    from reportlab.lib.units import mm
    from reportlab.pdfgen import canvas
    # StreamingResponse already imported at module level

    p = await db.payments.find_one({"id": payment_id, "user_id": user["id"]}, {"_id": 0})
    if not p:
        raise HTTPException(404, "Invoice not found")
    if p.get("status") != "success":
        raise HTTPException(400, "Invoice only available for successful payments")
    mem = await db.memberships.find_one({"payment_id": payment_id}, {"_id": 0})

    buf = BytesIO()
    c = canvas.Canvas(buf, pagesize=A4)
    width, height = A4

    # Header bar
    c.setFillColor(colors.HexColor("#0A0A0A"))
    c.rect(0, height - 40 * mm, width, 40 * mm, fill=True, stroke=False)

# Header
    c.setFillColor(colors.HexColor("#FF4500"))
    c.setFont("Helvetica-Bold", 28)
    c.drawCentredString(width / 2, height - 22 * mm, "THE GRIND STATION")

# Address
    c.setFillColor(colors.white)
    c.setFont("Helvetica", 10)
    c.drawCentredString(
    width / 2,
    height - 30 * mm,
    "9, Narayana Homes, Srivani Nagar, Miyapur, Telangana 502032"
)

# Email (new row)
    c.drawCentredString(
    width / 2,
    height - 35 * mm,
    "hello@grindstation.in"
)

    # Invoice title
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 22)
    c.drawString(20 * mm, height - 55 * mm, "INVOICE")
    c.setFont("Helvetica", 10)
    c.drawRightString(width - 20 * mm, height - 52 * mm, f"Invoice #: {p.get('invoice_no','—')}")
    c.drawRightString(width - 20 * mm, height - 58 * mm, f"Date: {p['created_at'][:10]}")
    c.drawRightString(width - 20 * mm, height - 64 * mm, f"Method: {p.get('method','').replace('_',' ').upper()}")

    # Bill to
    c.setFont("Helvetica-Bold", 11)
    c.drawString(20 * mm, height - 75 * mm, "BILL TO")
    c.setFont("Helvetica", 10)
    c.drawString(20 * mm, height - 82 * mm, user.get("name", ""))
    c.drawString(20 * mm, height - 87 * mm, user.get("email", ""))
    c.drawString(20 * mm, height - 92 * mm, user.get("mobile", ""))

    # Table
    y = height - 110 * mm
    c.setFillColor(colors.HexColor("#F3F4F6"))
    c.rect(20 * mm, y, width - 40 * mm, 9 * mm, fill=True, stroke=False)
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 10)
    c.drawString(22 * mm, y + 2.5 * mm, "DESCRIPTION")
    c.drawRightString(width - 22 * mm, y + 2.5 * mm, "AMOUNT")
    y -= 12 * mm
    c.setFont("Helvetica", 10)
    c.drawString(22 * mm, y, p.get("plan_name", ""))
    c.drawRightString(width - 22 * mm, y, f"₹ {p.get('base_amount', p.get('amount', 0)):,.2f}")

    if p.get("discount_percent", 0):
        y -= 7 * mm
        c.setFillColor(colors.HexColor("#FF4500"))
        c.drawString(22 * mm, y, f"Discount ({int(p['discount_percent'])}%)")
        disc_value = p.get("base_amount", p.get("amount", 0)) - p["amount"]
        c.drawRightString(width - 22 * mm, y, f"- ₹ {disc_value:,.2f}")
        c.setFillColor(colors.black)

    # Total
    y -= 12 * mm
    c.setStrokeColor(colors.HexColor("#0A0A0A"))
    c.setLineWidth(0.5)
    c.line(20 * mm, y + 6 * mm, width - 20 * mm, y + 6 * mm)
    c.setFont("Helvetica-Bold", 14)
    c.drawString(22 * mm, y, "TOTAL PAID")
    c.setFillColor(colors.HexColor("#FF4500"))
    c.drawRightString(width - 22 * mm, y, f"₹ {p['amount']:,.2f}")
    c.setFillColor(colors.black)

    if mem:
        y -= 25 * mm
        c.setFont("Helvetica-Bold", 11)
        c.drawString(20 * mm, y, "MEMBERSHIP")
        c.setFont("Helvetica", 10)
        c.drawString(20 * mm, y - 6 * mm, f"Plan: {mem['plan_name']}")
        c.drawString(20 * mm, y - 12 * mm, f"Active: {mem['start_date'][:10]}  →  {mem['expiry_date'][:10]}")
        if mem.get("extension_days"):
            c.drawString(20 * mm, y - 18 * mm, f"Includes {mem['extension_days']} bonus days")

    # Footer
    c.setFillColor(colors.HexColor("#6B7280"))
    c.setFont("Helvetica-Oblique", 8)
    c.drawCentredString(width / 2, 15 * mm, "Thank you for choosing The Grind Station — Transform Your Body. Build Your Grind.")

    c.showPage()
    c.save()
    buf.seek(0)
    return StreamingResponse(buf, media_type="application/pdf",
                             headers={"Content-Disposition": f'attachment; filename="invoice-{p.get("invoice_no","grind")}.pdf"'})

# ---------- Classes ----------
@api.get("/classes")
async def list_classes():
    cls = await db.classes.find({"active": True}, {"_id": 0}).to_list(200)
    return cls

@api.post("/classes")
async def create_class(body: ClassIn, admin: dict = Depends(require_admin)):
    doc = {"id": str(uuid.uuid4()), "active": True, **body.model_dump(), "created_at": iso(utcnow())}
    await db.classes.insert_one(doc)
    doc.pop("_id", None)
    return doc

@api.put("/classes/{class_id}")
async def update_class(class_id: str, body: ClassUpdate, admin: dict = Depends(require_admin)):
    updates = {k: v for k, v in body.model_dump().items() if v is not None}
    res = await db.classes.update_one({"id": class_id}, {"$set": updates})
    if res.matched_count == 0:
        raise HTTPException(404, "Class not found")
    return await db.classes.find_one({"id": class_id}, {"_id": 0})

@api.delete("/classes/{class_id}")
async def delete_class(class_id: str, admin: dict = Depends(require_admin)):
    res = await db.classes.delete_one({"id": class_id})
    return {"deleted": res.deleted_count}

def has_active_membership(membership) -> bool:
    if not membership:
        return False
    try:
        expiry = datetime.fromisoformat(membership["expiry_date"])
        return expiry > utcnow()
    except Exception:
        return False

@api.post("/classes/book")
async def book_class(body: BookClassIn, user: dict = Depends(get_current_user)):
    cls = await db.classes.find_one({"id": body.class_id, "active": True}, {"_id": 0})
    if not cls:
        raise HTTPException(404, "Class not found")
    # advance-booking window: today through next 3 days inclusive
    try:
        target = datetime.strptime(body.session_date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(400, "Invalid session_date. Use YYYY-MM-DD")
    today = utcnow().date()
    delta = (target - today).days
    if delta < 0:
        raise HTTPException(400, "Cannot book past sessions")
    if delta > 3:
        raise HTTPException(400, "You can only book up to 3 days in advance")
    # membership check
    mem = await db.memberships.find_one({"user_id": user["id"], "status": "active"}, {"_id": 0}, sort=[("created_at", -1)])
    if not has_active_membership(mem):
        raise HTTPException(403, "Active membership required to book classes")
    # already booked?
    existing = await db.class_bookings.find_one(
        {"user_id": user["id"], "class_id": body.class_id, "session_date": body.session_date,
         "status": {"$in": ["confirmed", "waitlist"]}})
    if existing:
        raise HTTPException(400, "You already booked this session")
    # count current bookings for this session
    booked_count = await db.class_bookings.count_documents(
        {"class_id": body.class_id, "session_date": body.session_date, "status": "confirmed"})
    status_val = "confirmed" if booked_count < int(cls["capacity"]) else "waitlist"
    doc = {"id": str(uuid.uuid4()), "user_id": user["id"], "class_id": body.class_id,
           "class_name": cls["name"], "session_date": body.session_date, "status": status_val,
           "created_at": iso(utcnow())}
    await db.class_bookings.insert_one(doc)
    doc.pop("_id", None)
    send_email(user["email"], f"{cls['name']} — {status_val.title()}",
               f"Hi {user.get('name','Member')},\n\nYour {cls['name']} booking for {body.session_date} at {cls.get('start_time','')} is {status_val.upper()}.\n\n— The Grind Station")
    return doc

@api.delete("/classes/book/{booking_id}")
async def cancel_booking(booking_id: str, user: dict = Depends(get_current_user)):
    res = await db.class_bookings.delete_one({"id": booking_id, "user_id": user["id"]})
    if res.deleted_count == 0:
        raise HTTPException(404, "Booking not found")
    return {"cancelled": True}

@api.get("/classes/availability")
async def class_availability(class_id: str, session_date: str):
    cls = await db.classes.find_one({"id": class_id}, {"_id": 0})
    if not cls:
        raise HTTPException(404, "Class not found")
    booked = await db.class_bookings.count_documents(
        {"class_id": class_id, "session_date": session_date, "status": "confirmed"})
    return {"capacity": cls["capacity"], "booked": booked, "available": max(0, cls["capacity"] - booked)}

# ---------- Recovery ----------
@api.get("/recovery/usage")
async def recovery_usage(user: dict = Depends(get_current_user)):
    ym = utcnow().strftime("%Y-%m")
    out = {}
    for fac in ["sauna", "steam", "ice"]:
        rec = await db.recovery_usage.find_one({"user_id": user["id"], "facility": fac, "year_month": ym}, {"_id": 0})
        used = rec["count"] if rec else 0
        out[fac] = {"used": used, "limit": 2, "remaining": max(0, 2 - used),
                    "sessions": rec.get("sessions", []) if rec else []}
    return {"year_month": ym, "facilities": out}

@api.post("/recovery/book")
async def recovery_book(body: RecoveryBookIn, user: dict = Depends(get_current_user)):
    mem = await db.memberships.find_one({"user_id": user["id"], "status": "active"}, {"_id": 0}, sort=[("created_at", -1)])
    if not has_active_membership(mem):
        raise HTTPException(403, "Active membership required for Recovery Zone")
    ym = utcnow().strftime("%Y-%m")
    rec = await db.recovery_usage.find_one({"user_id": user["id"], "facility": body.facility, "year_month": ym})
    used = rec["count"] if rec else 0
    if used >= 2:
        raise HTTPException(400, f"Monthly limit reached for {body.facility} bath (2/2)")
    session = {"date": body.session_date, "at": iso(utcnow())}
    if rec:
        await db.recovery_usage.update_one(
            {"_id": rec["_id"]},
            {"$inc": {"count": 1}, "$push": {"sessions": session}})
    else:
        await db.recovery_usage.insert_one({
            "id": str(uuid.uuid4()), "user_id": user["id"], "facility": body.facility,
            "year_month": ym, "count": 1, "sessions": [session], "created_at": iso(utcnow())
        })
    return {"facility": body.facility, "used": used + 1, "limit": 2, "remaining": 2 - (used + 1)}

# ---------- Admin ----------
@api.get("/admin/users")
async def admin_users(admin: dict = Depends(require_admin)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    out = []
    for u in users:
        mem = await db.memberships.find_one({"user_id": u["id"], "status": "active"}, {"_id": 0}, sort=[("created_at", -1)])
        u["active_membership"] = mem
        out.append(u)
    return out

@api.get("/admin/payments")
async def admin_payments(admin: dict = Depends(require_admin)):
    payments = await db.payments.find({"status": "success"}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return payments

@api.get("/admin/analytics")
async def admin_analytics(admin: dict = Depends(require_admin)):
    total_users = await db.users.count_documents({"role": "user"})
    active_members = await db.memberships.count_documents({"status": "active"})
    payments = await db.payments.find({"status": "success"}, {"_id": 0}).to_list(10000)
    revenue = sum(p.get("amount", 0) for p in payments)
    # most booked classes
    pipeline = [
        {"$match": {"status": "confirmed"}},
        {"$group": {"_id": "$class_name", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
        {"$limit": 5},
    ]
    most_booked = await db.class_bookings.aggregate(pipeline).to_list(10)
    # plan sales
    plan_sales_pipe = [
        {"$match": {"status": "success"}},
        {"$group": {"_id": "$plan_name", "count": {"$sum": 1}, "revenue": {"$sum": "$amount"}}},
        {"$sort": {"count": -1}},
    ]
    plan_sales = await db.payments.aggregate(plan_sales_pipe).to_list(20)
    # recovery usage stats
    rec_pipe = [
        {"$group": {"_id": "$facility", "total": {"$sum": "$count"}}},
    ]
    recovery_stats = await db.recovery_usage.aggregate(rec_pipe).to_list(10)
    return {
        "total_users": total_users,
        "active_members": active_members,
        "revenue": revenue,
        "total_payments": len(payments),
        "most_booked_classes": [{"name": x["_id"], "count": x["count"]} for x in most_booked],
        "plan_sales": [{"plan": x["_id"], "count": x["count"], "revenue": x["revenue"]} for x in plan_sales],
        "recovery_stats": [{"facility": x["_id"], "total": x["total"]} for x in recovery_stats],
    }

@api.post("/admin/recovery/reset")
async def admin_reset_recovery(admin: dict = Depends(require_admin)):
    ym = utcnow().strftime("%Y-%m")
    res = await db.recovery_usage.delete_many({"year_month": ym})
    return {"reset": res.deleted_count, "year_month": ym}

@api.get("/admin/bookings")
async def admin_bookings(admin: dict = Depends(require_admin)):
    bookings = await db.class_bookings.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return bookings

@api.get("/admin/recovery")
async def admin_recovery(admin: dict = Depends(require_admin)):
    rec = await db.recovery_usage.find({}, {"_id": 0}).to_list(1000)
    return rec

# ---------- Contact ----------
@api.post("/contact")
async def contact(body: ContactIn):
    doc = {"id": str(uuid.uuid4()), **body.model_dump(), "created_at": iso(utcnow())}
    await db.contact_messages.insert_one(doc)
    doc.pop("_id", None)
    return {"ok": True, "id": doc["id"]}

@api.get("/admin/contact")
async def admin_contact(admin: dict = Depends(require_admin)):
    msgs = await db.contact_messages.find({}, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return msgs

# ---------- Health ----------
@api.get("/")
async def root():
    return {"ok": True, "service": "The Grind Station"}

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
@api.get("/")
async def root():
    return {"ok": True, "service": "The Grind Station"}

app.include_router(api)   # <-- ADD THIS LINE

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:8000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)