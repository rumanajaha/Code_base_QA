import type { Answer, Mode, Repository, Ingestion } from "./types";
export const sampleRepo: Repository = {
  id: "demo-auth",
  name: "fastapi-starter",
  url: "https://github.com/codebase-demo/fastapi-starter",
  branch: "main",
  status: "ready",
  demo: true,
};
export const demoStats: Ingestion = {
  status: "ready",
  files: 24,
  chunks: 86,
  graph_nodes: 112,
  graph_edges: 148,
  unresolved_calls: 3,
  progress: 100,
};
export const demoFiles: Record<string, string> = {
  "auth/routes.py": `from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from auth.schemas import LoginRequest, TokenResponse
from auth.service import authenticate_user
from auth.tokens import create_jwt
from db.session import get_db

router = APIRouter(prefix="/auth", tags=["auth"])
@router.post("/login", response_model=TokenResponse)
async def login(
    payload: LoginRequest,
    db: Session = Depends(get_db),
) -> TokenResponse:
    """Authenticate a user and return an access token."""
    user = authenticate_user(
        db=db,
        email=payload.email,
        password=payload.password,
    )

    if user is None:
        raise HTTPException(
            status_code=401,
            detail="Invalid email or password",
        )

    access_token = create_jwt(subject=str(user.id))

    return TokenResponse(
        access_token=access_token,
        token_type="bearer",
        expires_in=3600,
    )`,
  "auth/service.py": `from sqlalchemy.orm import Session
from auth.security import verify_password
from db.users import get_user_by_email


def authenticate_user(
    db: Session,
    email: str,
    password: str,
):
    """Look up a user and verify their password."""
    user = get_user_by_email(db, email)

    if user is None:
        return None

    if not verify_password(password, user.hashed_password):
        return None

    if not user.is_active:
        return None

    return user


# Password verification is handled by auth.security.
# User lookup is handled by db.users.
# Neither function exposes the stored password.`,
  "auth/tokens.py": `from datetime import datetime, timedelta, timezone
from jose import jwt
from config import settings
def create_jwt(subject: str) -> str:
    """Issue a short-lived access token."""
    now = datetime.now(timezone.utc)
    payload = {
        "sub": subject,
        "iat": now,
        "exp": now + timedelta(hours=1),
    }
    return jwt.encode(
        payload, settings.SECRET_KEY,
        algorithm="HS256",
    )`,
  "db/users.py": `from sqlalchemy.orm import Session
from db.models import User


# Database queries used by the authentication service.


def get_user_by_email(db: Session, email: str):
    """Find a single user by their email address."""
    return (
        db.query(User)
        .filter(User.email == email)
        .first()
    )


def get_user(db: Session, user_id: int):
    return db.query(User).filter(User.id == user_id).first()

# All queries share the request-scoped database session.`,
  "auth/security.py": `from passlib.context import CryptContext

password_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Check a plaintext password against its bcrypt hash."""
    return password_context.verify(plain_password, hashed_password)


def hash_password(password: str) -> str:
    return password_context.hash(password)`,
  "config.py": `from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    APP_NAME: str = "FastAPI Starter"
    DATABASE_URL: str = "sqlite:///./app.db"
    SECRET_KEY: str
    TOKEN_EXPIRE_MINUTES: int = 60

    model_config = {"env_file": ".env"}


settings = Settings()`,
};
const retrieved = [
  {
    chunk: {
      id: "c1",
      file_path: "auth/routes.py",
      start_line: 10,
      end_line: 34,
      node_type: "function",
      name: "login",
      qualified_name: "login",
    },
    score: 0.84,
    source: "semantic" as const,
    via: null,
    rank: 1,
  },
  {
    chunk: {
      id: "c2",
      file_path: "auth/service.py",
      start_line: 5,
      end_line: 28,
      node_type: "function",
      name: "authenticate_user",
      qualified_name: "authenticate_user",
    },
    score: 0.79,
    source: "semantic" as const,
    via: null,
    rank: 2,
  },
  {
    chunk: {
      id: "c3",
      file_path: "db/users.py",
      start_line: 8,
      end_line: 20,
      node_type: "function",
      name: "get_user_by_email",
      qualified_name: "get_user_by_email",
    },
    score: null,
    source: "graph" as const,
    via: "authenticate_user",
    rank: 3,
  },
  {
    chunk: {
      id: "c4",
      file_path: "auth/tokens.py",
      start_line: 3,
      end_line: 15,
      node_type: "function",
      name: "create_jwt",
      qualified_name: "create_jwt",
    },
    score: null,
    source: "graph" as const,
    via: "login",
    rank: 4,
  },
  {
    chunk: {
      id: "c5",
      file_path: "auth/security.py",
      start_line: 6,
      end_line: 8,
      node_type: "function",
      name: "verify_password",
      qualified_name: "verify_password",
    },
    score: null,
    source: "graph" as const,
    via: "authenticate_user",
    rank: 5,
  },
];
export function demoAnswer(question: string, mode: Mode): Answer {
  const q = question.toLowerCase();
  let text =
    "The authentication flow connects the API route, user lookup, password verification, and token generation across four modules.\n\n**1. Receive the request**\nThe `login()` route accepts an email and password, then delegates to `authenticate_user()`. Invalid credentials return a 401 response. [auth/routes.py:10-34]\n\n**2. Verify the user**\n`authenticate_user()` looks up the user, verifies their password, and checks that the account is active. [auth/service.py:5-28] The user lookup is handled by `get_user_by_email()` in the database layer. [db/users.py:8-20]\n\n**3. Issue the token**\nOnce authenticated, `create_jwt()` signs a short-lived token with the user ID as its subject. The route returns the token as a bearer credential. [auth/tokens.py:3-15]\n\nIn other words: **request → authenticate → look up user → verify password → issue token.**";
  let query_type = "cross_file";
  let items = [...retrieved];
  let low = false;
  let unsupported: string[] = [];
  if (/password|hash|bcrypt/.test(q) && !/flow/.test(q)) {
    text =
      "Passwords are verified in `verify_password()` using a Passlib context configured with **bcrypt**. The plaintext password is checked against the stored hash; the hash is never returned. [auth/security.py:6-8]\n\nThe authentication service calls this verifier after finding the user. A missing user, failed password check, or inactive account causes authentication to return `None`. [auth/service.py:5-28]";
    query_type = "api_usage";
  } else if (/config|environment|setting/.test(q)) {
    text =
      "Application configuration is defined by the `Settings` class. It reads environment variables and an optional `.env` file. The settings include the application name, database URL, signing key, and token lifetime. [config.py:4-13]\n\n`SECRET_KEY` has no default, so it must be provided by the environment.";
    query_type = "config";
    items = [
      {
        chunk: {
          id: "c6",
          file_path: "config.py",
          start_line: 4,
          end_line: 13,
          node_type: "class",
          name: "Settings",
          qualified_name: "Settings",
        },
        score: 0.91,
        source: "semantic",
        via: null,
        rank: 1,
      },
    ];
  } else if (/depend|call|connect|architect|structure/.test(q)) {
    text =
      "The sample repository separates request handling, business logic, and persistence.\n\n**API layer**\n`login()` accepts the incoming request and calls the authentication service. [auth/routes.py:10-34]\n\n**Service layer**\n`authenticate_user()` connects the database lookup with password verification. [auth/service.py:5-28]\n\n**Database layer**\n`get_user_by_email()` retrieves the matching user through the request-scoped SQLAlchemy session. [db/users.py:8-20]\n\nThe dependency graph extends semantic matches with these direct function calls, revealing context across files.";
    query_type = "architectural";
  } else if (!/auth|login|user|token|work|overview|explain|flow/.test(q)) {
    text =
      "The available sample context is insufficient to answer this question reliably. This demo contains authentication, token, database lookup, and configuration code.\n\nTry asking about the authentication flow, how passwords are verified, or which functions depend on each other. Connect your backend to ask questions about your own repository.";
    items = [];
    low = true;
    unsupported = [
      "No relevant implementation was found in the sample context.",
    ];
  }
  if (mode === "baseline") {
    text =
      "Baseline mode answers without retrieving repository code. I cannot verify this implementation from the repository in this mode.\n\nIn a typical FastAPI application, a login route validates credentials through an authentication service and returns an access token. Switch to Semantic, Hybrid, or Adaptive to inspect repository evidence.";
    items = [];
    low = true;
    unsupported = [
      "This answer uses general knowledge and is not grounded in retrieved repository code.",
    ];
  }
  if (mode === "semantic") {
    items = items.filter((i) => i.source === "semantic");
    text = text
      .replace(/\s*\[db\/users.py:8-20\]/g, "")
      .replace(/\s*\[auth\/tokens.py:3-15\]/g, "")
      .replace(/\s*\[auth\/security.py:6-8\]/g, "");
    if (/password/.test(q)) {
      text =
        "The retrieved service calls `verify_password()` to compare the submitted password with the stored hash. It returns `None` when verification fails or the user is inactive. [auth/service.py:5-28]\n\nThe password verifier itself was not retrieved in Semantic mode. Try Hybrid or Adaptive to follow that dependency.";
    }
  }
  const citations = [...text.matchAll(/\[([^\]]+):(\d+)-(\d+)\]/g)].map(
    (m) => ({
      file_path: m[1],
      start_line: +m[2],
      end_line: +m[3],
      valid: items.some(
        (i) =>
          i.chunk.file_path === m[1] &&
          i.chunk.start_line <= +m[2] &&
          i.chunk.end_line >= +m[3],
      ),
    }),
  );
  return {
    text,
    citations,
    retrieved: items,
    query_type,
    grounding_score: low ? 0.4 : mode === "semantic" ? 0.81 : 0.92,
    low_confidence: low,
    unsupported_items: unsupported,
    mode,
    latency_ms: mode === "baseline" ? 680 : 2140,
    tokens_used: mode === "baseline" ? 420 : 1830,
  };
}
