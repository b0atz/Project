from fastapi import APIRouter, HTTPException, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from passlib.context import CryptContext
from jose import jwt, JWTError
from pydantic import BaseModel
from app.db import db

router = APIRouter()

SECRET_KEY = "mysecretkey"
ALGORITHM = "HS256"

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
users_collection = db["users"]

# ---------- Models ----------
class RegisterIn(BaseModel):
    username: str
    password: str

class LoginIn(BaseModel):
    username: str
    password: str

# ---------- Utils ----------
def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict) -> str:
    """ ออก token แบบไม่หมดอายุ """
    return jwt.encode(data.copy(), SECRET_KEY, algorithm=ALGORITHM)

# ---------- Routes ----------
@router.post("/register", tags=["auth"])
def register(user: RegisterIn):
    if users_collection.find_one({"username": user.username}):
        raise HTTPException(status_code=400, detail="Username already exists")
    users_collection.insert_one({
        "username": user.username,
        "password": get_password_hash(user.password)
    })
    return {"msg": "User registered successfully"}

@router.post("/login", tags=["auth"])
def login(user: LoginIn):
    db_user = users_collection.find_one({"username": user.username})
    if not db_user or not verify_password(user.password, db_user["password"]):
        raise HTTPException(status_code=401, detail="Invalid username or password")
    token = create_access_token({"sub": user.username})
    return {"access_token": token, "token_type": "bearer"}

# ---------- Token Checker ----------
security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    token = credentials.credentials
    try:
        payload = jwt.decode(
            token,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            options={"verify_exp": False}  # ✅ ปิดตรวจวันหมดอายุ
        )
        username = payload.get("sub")
        if not username:
            raise HTTPException(status_code=401, detail="Invalid token payload")
        return username
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
