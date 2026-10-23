"""Demonstration algorithms for PyDebug showing AST sub-expressions & live tracing."""
from __future__ import annotations

from pydebug.core.tracer import PyTracer, spy
from pydebug.core.events import TraceSession


@spy
def compute_risk_score(age: int, bmi: float, smoker: bool) -> float:
    """Calculates actuarial medical risk score with multiple sub-expressions.
    Raises ValueError if age is invalid (< 18 or > 120).
    """
    if not isinstance(age, (int, float)):
        raise TypeError(f"Age must be a number, got {type(age).__name__}")
    if age < 18 or age > 120:
        raise ValueError(f"Age {age} is outside the allowable actuarial range [18, 120]")

    base = 1.0
    age_factor = (age - 18) * 0.025
    bmi_penalty = max(0.0, (bmi - 24.5) * 0.08)
    smoker_multiplier = 1.65 if smoker else 1.0

    total_risk = (base + age_factor + bmi_penalty) * smoker_multiplier
    return round(total_risk, 3)


@spy
def calculate_order_total(items: list[dict], discount_code: str | None = None) -> float:
    """Calculates total order price with tax, discounts, and line-item validation.
    Raises ValueError on empty items or unrecognized discount code.
    Raises KeyError if an item is missing 'price' or 'qty'.
    """
    if not items:
        raise ValueError("Order must contain at least one item")

    subtotal = 0.0
    for idx, item in enumerate(items):
        if not isinstance(item, dict):
            raise TypeError(f"Item #{idx} must be a dictionary, got {type(item).__name__}")
        if "price" not in item:
            raise KeyError(f"Item #{idx} is missing required 'price' field")
        qty = item.get("qty", 1)
        subtotal += float(item["price"]) * int(qty)

    discount_rate = 0.0
    if discount_code:
        code = str(discount_code).strip().upper()
        if code == "VIP20":
            discount_rate = 0.20
        elif code == "SAVE10":
            discount_rate = 0.10
        elif code == "HALF50":
            discount_rate = 0.50
        else:
            raise ValueError(f"Invalid discount code '{discount_code}'. Valid codes: VIP20, SAVE10, HALF50")

    discounted_subtotal = subtotal * (1.0 - discount_rate)
    tax_rate = 0.08
    total = discounted_subtotal * (1.0 + tax_rate)
    return round(total, 2)


@spy
def divide_and_process(numerator: float, denominator: float) -> dict[str, float]:
    """Divides numbers with ratio analysis.
    Raises ZeroDivisionError if denominator is zero.
    """
    if denominator == 0:
        raise ZeroDivisionError("Denominator cannot be zero in divide_and_process()")
    
    ratio = numerator / denominator
    percentage = (numerator / denominator) * 100.0
    inverse = denominator / numerator if numerator != 0 else 0.0

    return {
        "numerator": float(numerator),
        "denominator": float(denominator),
        "ratio": round(ratio, 4),
        "percentage": round(percentage, 2),
        "inverse": round(inverse, 4),
    }


@spy
def evaluate_claim_rules(claim_id: str, amount: float, risk_score: float) -> dict[str, any]:
    """Evaluates insurance approval policies using compound conditions."""
    if amount < 0:
        raise ValueError(f"Claim amount cannot be negative: {amount}")

    auto_approve_limit = 5000.0
    requires_manual_audit = (amount > auto_approve_limit) and (risk_score >= 1.45)
    fraud_flag = (amount > 20000.0) or (risk_score > 2.2)

    status = "AUDIT_REQUIRED" if requires_manual_audit else ("REJECTED" if fraud_flag else "AUTO_APPROVED")

    return {
        "claim_id": str(claim_id),
        "amount": float(amount),
        "risk_score": float(risk_score),
        "status": status,
        "payout": round(amount * 0.85, 2) if status == "AUTO_APPROVED" else 0.0,
    }


def run_demo() -> TraceSession:
    """Executes the demo workflow within a PyTracer session."""
    session = TraceSession(title="Actuarial Risk & Claim Evaluation")
    tracer = PyTracer(session=session, include_paths=[__file__])
    tracer.start()

    try:
        patients = [
            {"id": "CLM-001", "age": 42, "bmi": 26.2, "smoker": False, "amount": 3200.0},
            {"id": "CLM-002", "age": 58, "bmi": 31.5, "smoker": True, "amount": 8400.0},
            {"id": "CLM-003", "age": 29, "bmi": 22.0, "smoker": False, "amount": 1250.0},
        ]

        decisions = []
        for p in patients:
            risk = compute_risk_score(p["age"], p["bmi"], p["smoker"])
            dec = evaluate_claim_rules(p["id"], p["amount"], risk)
            decisions.append(dec)

    finally:
        tracer.stop()

    return session


if __name__ == "__main__":
    from pydebug.server.app import serve_trace
    sess = run_demo()
    serve_trace(sess, port=8899, auto_open=True)