"""Simulated traffic scenarios for the Studio dashboard.

These functions hold the *business logic* that the dashboard's
Traffic Simulator traces line by line. They live here (and not in
``server/app.py``) so the tracer records them: the ``pydebug/server``
directory is excluded from tracing so that the server itself is never
traced.
"""


def simulate_claim_adjudication() -> str:
    claim_id = "CLM-902"
    amount = 4800.0
    risk_score = 1.25
    return "APPROVED" if (amount <= 5000.0 and risk_score < 2.0) else "MANUAL_REVIEW"


def simulate_checkout_calculation() -> float:
    items = [
        {"name": "Mechanical Keyboard RGB", "price": 110.0, "qty": 1},
        {"name": "Wrist Rest Foam", "price": 20.0, "qty": 1},
    ]
    subtotal = sum(i["price"] * i["qty"] for i in items)
    discount = subtotal * 0.20
    tax = (subtotal - discount) * 0.08
    return round(subtotal - discount + tax, 2)


def simulate_waiting_period_check() -> str:
    disease_name = "Cataract"
    waiting_period_months = 24
    policy_age_months = 36
    return "COVERED" if policy_age_months >= waiting_period_months else "WAITING_PERIOD_ACTIVE"
