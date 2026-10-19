# Expected Code Analysis Metadata: `mini_shop`

This document contains the ground-truth reference tables for the `backend/tests/fixtures/mini_shop/` test repository fixture.

---

## 1. Functions and Classes

Total: 1 Class, 5 Methods, 29 Functions (34 functions/methods total across 8 parseable files).

| File | Qualified Name | Type | Start Line | End Line |
| :--- | :--- | :--- | :---: | :---: |
| `auth/__init__.py` | `auth.get_auth_version` | Function | 6 | 8 |
| `auth/tokens.py` | `auth.tokens.generate_token` | Function | 7 | 10 |
| `auth/tokens.py` | `auth.tokens.verify_token` | Function | 13 | 21 |
| `auth/tokens.py` | `auth.tokens.decode_payload` | Function | 24 | 30 |
| `auth/tokens.py` | `auth.tokens.require_token` | Function (Decorator) | 33 | 42 |
| `auth/tokens.py` | `auth.tokens.require_token.wrapper` | Nested Function | 35 | 41 |
| `auth/users.py` | `auth.users.hash_password` | Function | 6 | 8 |
| `auth/users.py` | `auth.users.verify_password` | Function | 11 | 13 |
| `auth/users.py` | `auth.users.create_user` | Function | 16 | 24 |
| `auth/users.py` | `auth.users.get_user_profile` | Function | 27 | 33 |
| `auth/users.py` | `auth.users.get_current_user` | Function (Decorated) | 36 | 39 |
| `shop/__init__.py` | `shop.get_shop_version` | Function | 6 | 8 |
| `shop/catalog.py` | `shop.catalog.format_currency` | Function | 5 | 7 |
| `shop/catalog.py` | `shop.catalog.get_product` | Function | 10 | 16 |
| `shop/catalog.py` | `shop.catalog.list_products` | Function | 19 | 25 |
| `shop/catalog.py` | `shop.catalog.filter_by_category` | Function (Long Docstring) | 28 | 43 |
| `shop/catalog.py` | `shop.catalog.search_products` | Function | 46 | 51 |
| `shop/catalog.py` | `shop.catalog.search_products.matches` | Nested Function | 48 | 49 |
| `shop/cart.py` | `shop.cart.ShoppingCart` | Class | 5 | 32 |
| `shop/cart.py` | `shop.cart.ShoppingCart.__init__` | Method | 8 | 11 |
| `shop/cart.py` | `shop.cart.ShoppingCart.add_item` | Method | 13 | 18 |
| `shop/cart.py` | `shop.cart.ShoppingCart.remove_item` | Method | 20 | 24 |
| `shop/cart.py` | `shop.cart.ShoppingCart.calculate_total` | Method | 26 | 28 |
| `shop/cart.py` | `shop.cart.ShoppingCart.clear` | Method | 30 | 32 |
| `shop/cart.py` | `shop.cart.calculate_cart_tax` | Function | 35 | 38 |
| `shop/orders.py` | `shop.orders.validate_order_id` | Function | 8 | 10 |
| `shop/orders.py` | `shop.orders.calculate_order_subtotal` | Function | 13 | 15 |
| `shop/orders.py` | `shop.orders.create_order` | Function | 18 | 29 |
| `shop/orders.py` | `shop.orders.get_order_status` | Function | 32 | 36 |
| `shop/orders.py` | `shop.orders.notify_customer` | Function (Unresolved Call) | 39 | 41 |
| `shop/orders.py` | `shop.orders.submit_order_async` | Async Function | 44 | 47 |
| `shop/discounts.py` | `shop.discounts.is_coupon_valid` | Function | 5 | 8 |
| `shop/discounts.py` | `shop.discounts.get_coupon_discount` | Function | 11 | 16 |
| `shop/discounts.py` | `shop.discounts.apply_order_discount` | Function | 19 | 24 |
| `shop/discounts.py` | `shop.discounts.compute_loyalty_discount` | Function | 27 | 33 |

*Note: In Python AST, `auth.users.get_current_user` has `lineno=36` (the `@require_token` decorator line) and `def` on line 37.*

---

## 2. Import Edges (Internal Repository Dependencies)

All imports connecting modules inside `mini_shop`. Note the circular dependency between `shop/orders.py` and `shop/discounts.py`.

| Source File | Line | Import Statement | Target File / Module | Imported Entities | Circular? |
| :--- | :---: | :--- | :--- | :--- | :---: |
| `auth/tokens.py` | 4 | `from config import SECRET_KEY, TOKEN_EXPIRY_SECONDS` | `config.py` | `SECRET_KEY`, `TOKEN_EXPIRY_SECONDS` | No |
| `auth/users.py` | 3 | `from auth.tokens import generate_token, require_token, verify_token` | `auth/tokens.py` | `generate_token`, `require_token`, `verify_token` | No |
| `shop/catalog.py` | 2 | `from config import CURRENCY` | `config.py` | `CURRENCY` | No |
| `shop/cart.py` | 2 | `from config import DEFAULT_TAX_RATE, MAX_CART_ITEMS` | `config.py` | `DEFAULT_TAX_RATE`, `MAX_CART_ITEMS` | No |
| `shop/orders.py` | 3 | `from config import FREE_SHIPPING_THRESHOLD, SHIPPING_FEE` | `config.py` | `FREE_SHIPPING_THRESHOLD`, `SHIPPING_FEE` | No |
| `shop/orders.py` | 4 | `from shop.catalog import get_product` | `shop/catalog.py` | `get_product` | No |
| `shop/orders.py` | 5 | `from shop.discounts import apply_order_discount` | `shop/discounts.py` | `apply_order_discount` | **Yes** (with `shop/discounts.py`) |
| `shop/discounts.py` | 2 | `from shop.orders import validate_order_id` | `shop/orders.py` | `validate_order_id` | **Yes** (with `shop/orders.py`) |

---

## 3. Direct Call Edges

Direct call edges between user-defined functions/methods in the repository, including unresolved calls.

| Source File | Line | Caller (Qualified Name) | Callee (Target Entity) | Resolved? | Notes |
| :--- | :---: | :--- | :--- | :---: | :--- |
| `auth/tokens.py` | 26 | `auth.tokens.decode_payload` | `auth.tokens.verify_token` | **Yes** | Internal module call |
| `auth/tokens.py` | 39 | `auth.tokens.require_token.wrapper` | `auth.tokens.verify_token` | **Yes** | Enclosing decorator helper call |
| `auth/tokens.py` | 41 | `auth.tokens.require_token.wrapper` | `func` (wrapped target) | **Yes** | Dynamic invocation of wrapped function |
| `auth/users.py` | 13 | `auth.users.verify_password` | `auth.users.hash_password` | **Yes** | Internal module call |
| `auth/users.py` | 23 | `auth.users.create_user` | `auth.users.hash_password` | **Yes** | Internal module call |
| `auth/users.py` | 36 | `auth.users.get_current_user` | `auth.tokens.require_token` | **Yes** | Decorator invocation |
| `auth/users.py` | 39 | `auth.users.get_current_user` | `auth.users.get_user_profile` | **Yes** | Internal module call |
| `shop/catalog.py` | 12 | `shop.catalog.get_product` | `shop.catalog.list_products` | **Yes** | Internal module call |
| `shop/catalog.py` | 51 | `shop.catalog.search_products` | `shop.catalog.search_products.matches` | **Yes** | Call to nested local function |
| `shop/cart.py` | 37 | `shop.cart.calculate_cart_tax` | `shop.cart.ShoppingCart.calculate_total` | **Yes** | Method call on class instance |
| `shop/orders.py` | 21 | `shop.orders.create_order` | `shop.orders.calculate_order_subtotal` | **Yes** | Internal module call |
| `shop/orders.py` | 22 | `shop.orders.create_order` | `shop.discounts.apply_order_discount` | **Yes** | Cross-module call (imported) |
| `shop/orders.py` | 34 | `shop.orders.get_order_status` | `shop.orders.validate_order_id` | **Yes** | Internal module call |
| `shop/orders.py` | 41 | `shop.orders.notify_customer` | `send_external_notification` | **No** | **Unresolved call** (undefined in repo/stdlib) |
| `shop/orders.py` | 47 | `shop.orders.submit_order_async` | `shop.orders.validate_order_id` | **Yes** | Async function calling sync function |
| `shop/discounts.py` | 13 | `shop.discounts.get_coupon_discount` | `shop.discounts.is_coupon_valid` | **Yes** | Internal module call |
| `shop/discounts.py` | 21 | `shop.discounts.apply_order_discount` | `shop.orders.validate_order_id` | **Yes** | Cross-module call (imported, circular) |
| `shop/discounts.py` | 23 | `shop.discounts.apply_order_discount` | `shop.discounts.get_coupon_discount` | **Yes** | Internal module call |
