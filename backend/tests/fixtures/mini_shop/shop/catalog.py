"""Product catalog browsing and searching."""
from config import CURRENCY


def format_currency(amount: float) -> str:
    """Format a numeric value with currency code."""
    return f"{amount:.2f} {CURRENCY}"


def get_product(product_id: str) -> dict | None:
    """Retrieve product details from the inventory catalog."""
    products = list_products()
    for p in products:
        if p["id"] == product_id:
            return p
    return None


def list_products() -> list[dict]:
    """Return static list of available shop products."""
    return [
        {"id": "p1", "name": "Python Book", "price": 29.99, "category": "books"},
        {"id": "p2", "name": "Mechanical Keyboard", "price": 89.99, "category": "tech"},
        {"id": "p3", "name": "Coffee Mug", "price": 12.50, "category": "home"},
    ]


def filter_by_category(items: list[dict], category: str) -> list[dict]:
    """Filter a list of shop catalog items by their assigned category.

    This helper inspects each dictionary in the provided catalog collection,
    matching the 'category' key against the normalized target category string.
    Items missing a category key or with mismatched values are excluded.

    Args:
        items: A list of product dictionaries containing catalog metadata.
        category: The category name to filter by (case-insensitive).

    Returns:
        A list of matching product dictionaries in their original sequence.
    """
    target = category.lower()
    return [item for item in items if item.get("category", "").lower() == target]


def search_products(query: str, items: list[dict]) -> list[dict]:
    """Search products using nested case-insensitive matcher."""
    def matches(item: dict) -> bool:
        return query.lower() in item.get("name", "").lower()

    return [item for item in items if matches(item)]
