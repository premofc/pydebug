"""Sample live script to test PyDebug line-by-line tracing with Hunter & Birdseye."""
from pydebug.core.tracer import spy

@spy
def calculate_order_total(items: list[dict], discount_code: str | None = None) -> float:
    subtotal = 0.0
    for item in items:
        price = item["price"] * item["qty"]
        subtotal += price

    discount_rate = 0.0
    if discount_code == "VIP20":
        discount_rate = 0.20
    elif discount_code == "SAVE10":
        discount_rate = 0.10

    discount_amount = subtotal * discount_rate
    tax = (subtotal - discount_amount) * 0.08
    final_total = round(subtotal - discount_amount + tax, 2)
    return final_total


def main():
    cart_items = [
        {"name": "Wireless Mechanical Keyboard", "price": 89.99, "qty": 2},
        {"name": "Gaming Mouse 16000 DPI", "price": 45.50, "qty": 1},
        {"name": "USB-C Braided Cable 2m", "price": 12.00, "qty": 3},
    ]

    total_with_vip = calculate_order_total(cart_items, discount_code="VIP20")
    print(f"VIP Order Total: ${total_with_vip}")

    total_regular = calculate_order_total(cart_items, discount_code=None)
    print(f"Regular Order Total: ${total_regular}")


if __name__ == "__main__":
    main()
