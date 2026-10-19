"""Discount calculation and promotion validation."""
from shop.orders import validate_order_id


def is_coupon_valid(coupon_code: str) -> bool:
    """Verify if promotional coupon is recognized."""
    active_coupons = ["SAVE10", "WELCOME20", "HALFPRICE"]
    return coupon_code.upper() in active_coupons


def get_coupon_discount(coupon_code: str) -> float:
    """Return discount rate corresponding to coupon code."""
    if not is_coupon_valid(coupon_code):
        return 0.0
    rates = {"SAVE10": 0.10, "WELCOME20": 0.20, "HALFPRICE": 0.50}
    return rates.get(coupon_code.upper(), 0.0)


def apply_order_discount(order_id: str, subtotal: float, coupon_code: str) -> float:
    """Apply coupon discount if order ID is valid."""
    if not validate_order_id(order_id):
        return 0.0
    rate = get_coupon_discount(coupon_code)
    return round(subtotal * rate, 2)


def compute_loyalty_discount(order_count: int, subtotal: float) -> float:
    """Calculate reward discount for returning shoppers."""
    if order_count >= 10:
        return round(subtotal * 0.15, 2)
    if order_count >= 5:
        return round(subtotal * 0.05, 2)
    return 0.0
