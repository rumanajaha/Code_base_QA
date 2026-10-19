"""Shopping cart management and total computation."""
from config import DEFAULT_TAX_RATE, MAX_CART_ITEMS


class ShoppingCart:
    """Represents a customer's active shopping cart session."""

    def __init__(self, user_id: str) -> None:
        """Initialize empty cart for a given user."""
        self.user_id = user_id
        self.items: list[dict] = []

    def add_item(self, item_id: str, price: float, quantity: int = 1) -> bool:
        """Add an item or increment quantity if within capacity limit."""
        if len(self.items) >= MAX_CART_ITEMS:
            return False
        self.items.append({"item_id": item_id, "price": price, "quantity": quantity})
        return True

    def remove_item(self, item_id: str) -> bool:
        """Remove all instances of item_id from the cart."""
        initial_count = len(self.items)
        self.items = [i for i in self.items if i["item_id"] != item_id]
        return len(self.items) < initial_count

    def calculate_total(self) -> float:
        """Sum prices across all cart line items."""
        return sum(item["price"] * item["quantity"] for item in self.items)

    def clear(self) -> None:
        """Remove all items from cart."""
        self.items.clear()


def calculate_cart_tax(cart: ShoppingCart, tax_rate: float = DEFAULT_TAX_RATE) -> float:
    """Compute sales tax for the current items in cart."""
    subtotal = cart.calculate_total()
    return round(subtotal * tax_rate, 2)
