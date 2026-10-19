"""Order processing and fulfillment."""
import asyncio
from config import FREE_SHIPPING_THRESHOLD, SHIPPING_FEE
from shop.catalog import get_product
from shop.discounts import apply_order_discount


def validate_order_id(order_id: str) -> bool:
    """Check if order ID has a valid prefix and length."""
    return order_id.startswith("ord_") and len(order_id) > 6


def calculate_order_subtotal(items: list[dict]) -> float:
    """Compute raw subtotal before discounts and taxes."""
    return sum(item.get("price", 0.0) * item.get("quantity", 1) for item in items)


def create_order(user_id: str, items: list[dict], coupon_code: str = "") -> dict:
    """Assemble order record with discount calculation."""
    order_id = f"ord_{len(items)}"
    subtotal = calculate_order_subtotal(items)
    discount = apply_order_discount(order_id, subtotal, coupon_code)
    shipping = 0.0 if subtotal >= FREE_SHIPPING_THRESHOLD else SHIPPING_FEE
    return {
        "order_id": order_id,
        "user_id": user_id,
        "total": max(0.0, subtotal - discount + shipping),
        "status": "pending",
    }


def get_order_status(order_id: str) -> str:
    """Check current status string for an order."""
    if not validate_order_id(order_id):
        return "invalid"
    return "confirmed"


def notify_customer(order_id: str, email: str) -> None:
    """Send order confirmation to customer via external notification."""
    send_external_notification(email, f"Order {order_id} has been placed.")


async def submit_order_async(order_id: str, amount: float) -> bool:
    """Asynchronously simulate payment processing and submission."""
    await asyncio.sleep(0.01)
    return validate_order_id(order_id) and amount > 0
