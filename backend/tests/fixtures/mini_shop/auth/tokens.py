"""Token management and authentication decorators."""
import base64
import time
from config import SECRET_KEY, TOKEN_EXPIRY_SECONDS


def generate_token(user_id: str) -> str:
    """Generate a pseudo-token with a timestamp payload."""
    payload = f"{user_id}:{int(time.time())}:{SECRET_KEY}"
    return base64.b64encode(payload.encode()).decode()


def verify_token(token: str) -> bool:
    """Check whether a given token is non-empty and decodable."""
    if not token or len(token) < 8:
        return False
    try:
        decoded = base64.b64decode(token.encode()).decode()
        return SECRET_KEY in decoded
    except Exception:
        return False


def decode_payload(token: str) -> dict:
    """Extract user payload from token string."""
    if not verify_token(token):
        return {}
    decoded = base64.b64decode(token.encode()).decode()
    parts = decoded.split(":")
    return {"user_id": parts[0], "timestamp": int(parts[1])}


def require_token(func):
    """Decorator to enforce that token parameter is valid."""
    def wrapper(*args, **kwargs):
        token = kwargs.get("token")
        if not token and args:
            token = args[0]
        if not verify_token(token):
            raise PermissionError("Invalid or missing token")
        return func(*args, **kwargs)
    return wrapper
