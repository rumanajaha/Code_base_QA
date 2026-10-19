"""User registration, password handling, and profile queries."""
import hashlib
from auth.tokens import generate_token, require_token, verify_token


def hash_password(raw_password: str) -> str:
    """Return SHA-256 hex digest of the raw password."""
    return hashlib.sha256(raw_password.encode()).hexdigest()


def verify_password(raw_password: str, hashed: str) -> bool:
    """Verify raw password against its stored hash."""
    return hash_password(raw_password) == hashed


def create_user(username: str, email: str, raw_password: str) -> dict:
    """Create a new user dictionary with hashed credentials."""
    user_id = f"usr_{len(username)}"
    return {
        "user_id": user_id,
        "username": username,
        "email": email,
        "password_hash": hash_password(raw_password),
    }


def get_user_profile(user_id: str) -> dict:
    """Retrieve dummy user profile by ID."""
    return {
        "user_id": user_id,
        "username": f"user_{user_id}",
        "is_active": True,
    }


@require_token
def get_current_user(token: str) -> dict:
    """Fetch current user info using validated token."""
    return get_user_profile("u123")
