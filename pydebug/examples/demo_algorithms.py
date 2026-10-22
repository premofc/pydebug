"""Demonstration algorithms for PyDebug showing AST sub-expressions & 3D call stacks."""
from __future__ import annotations

import asyncio
from pydebug.core.tracer import PyTracer, spy
from pydebug.core.events import TraceSession


@spy
def compute_risk_score(age: int, bmi: float, smoker: bool) -> float:
    """Calculates actuarial medical risk score with multiple sub-expressions."""
    base = 1.0
    age_factor = (age - 18) * 0.025
    bmi_penalty = max(0.0, (bmi - 24.5) * 0.08)
    smoker_multiplier = 1.65 if smoker else 1.0

    total_risk = (base + age_factor + bmi_penalty) * smoker_multiplier
    return round(total_risk, 3)


@spy
def evaluate_claim_rules(claim_id: str, amount: float, risk_score: float) -> dict[str, any]:
    """Evaluates insurance approval policies using compound conditions."""
    auto_approve_limit = 5000.0
    requires_manual_audit = (amount > auto_approve_limit) and (risk_score >= 1.45)
    fraud_flag = (amount > 20000.0) or (risk_score > 2.2)

    status = "AUDIT_REQUIRED" if requires_manual_audit else ("REJECTED" if fraud_flag else "AUTO_APPROVED")

    return {
        "claim_id": claim_id,
        "amount": amount,
        "risk_score": risk_score,
        "status": status,
        "payout": amount * 0.85 if status == "AUTO_APPROVED" else 0.0,
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
