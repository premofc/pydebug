import type { TraceSession } from '../types';

export const MOCK_TRACE_SESSION: TraceSession = {
  id: 'd58c40f7',
  title: 'Actuarial Risk & Claim Evaluation (Demo)',
  created_at: new Date().toISOString(),
  files: [
    'demo_algorithms.py'
  ],
  file_sources: {
    0: [
      '"""Demonstration algorithms for PyDebug showing AST sub-expressions & 3D call stacks."""',
      'from __future__ import annotations',
      '',
      '@spy',
      'def compute_risk_score(age: int, bmi: float, smoker: bool) -> float:',
      '    """Calculates actuarial medical risk score with multiple sub-expressions."""',
      '    base = 1.0',
      '    age_factor = (age - 18) * 0.025',
      '    bmi_penalty = max(0.0, (bmi - 24.5) * 0.08)',
      '    smoker_multiplier = 1.65 if smoker else 1.0',
      '',
      '    total_risk = (base + age_factor + bmi_penalty) * smoker_multiplier',
      '    return round(total_risk, 3)',
      '',
      '@spy',
      'def evaluate_claim_rules(claim_id: str, amount: float, risk_score: float) -> dict[str, any]:',
      '    """Evaluates insurance approval policies using compound conditions."""',
      '    auto_approve_limit = 5000.0',
      '    requires_manual_audit = (amount > auto_approve_limit) and (risk_score >= 1.45)',
      '    fraud_flag = (amount > 20000.0) or (risk_score > 2.2)',
      '',
      '    status = "AUDIT_REQUIRED" if requires_manual_audit else ("REJECTED" if fraud_flag else "AUTO_APPROVED")',
      '',
      '    return {',
      '        "claim_id": claim_id,',
      '        "amount": amount,',
      '        "risk_score": risk_score,',
      '        "status": status,',
      '        "payout": amount * 0.85 if status == "AUTO_APPROVED" else 0.0,',
      '    }',
      '',
      'def run_demo():',
      '    patients = [',
      '        {"id": "CLM-001", "age": 42, "bmi": 26.2, "smoker": False, "amount": 3200.0},',
      '        {"id": "CLM-002", "age": 58, "bmi": 31.5, "smoker": True, "amount": 8400.0},',
      '        {"id": "CLM-003", "age": 29, "bmi": 22.0, "smoker": False, "amount": 1250.0},',
      '    ]',
      '    decisions = []',
      '    for p in patients:',
      '        risk = compute_risk_score(p["age"], p["bmi"], p["smoker"])',
      '        dec = evaluate_claim_rules(p["id"], p["amount"], risk)',
      '        decisions.append(dec)',
      '    return decisions'
    ]
  },
  stats: {
    total_events: 19,
    files_count: 1,
    calls_count: 3,
    returns_count: 3,
    exceptions_count: 0,
    max_depth: 1,
    duration_ms: 24.0
  },
  events: [
    // === Call 1: compute_risk_score(age=42, bmi=26.2, smoker=False) ===
    {
      seq: 0,
      timestamp: 1718900000.001,
      kind: 'call',
      file_idx: 0,
      line: 5,
      func: 'compute_risk_score',
      depth: 1,
      src: 'def compute_risk_score(age: int, bmi: float, smoker: bool) -> float:',
      vars: { age: '42', bmi: '26.2', smoker: 'False' },
      vars_diff: { age: { old: '<unset>', new: '42' }, bmi: { old: '<unset>', new: '26.2' }, smoker: { old: '<unset>', new: 'False' } },
      expressions: [
        { text: 'age', val: '42', type_name: 'int', start_col: 23, end_col: 26, node_type: 'arg' },
        { text: 'bmi', val: '26.2', type_name: 'float', start_col: 33, end_col: 36, node_type: 'arg' },
        { text: 'smoker', val: 'False', type_name: 'bool', start_col: 45, end_col: 51, node_type: 'arg' }
      ]
    },
    {
      seq: 1,
      timestamp: 1718900000.002,
      kind: 'line',
      file_idx: 0,
      line: 7,
      func: 'compute_risk_score',
      depth: 1,
      src: '    base = 1.0',
      vars: { age: '42', bmi: '26.2', smoker: 'False', base: '1.0' },
      vars_diff: { base: { old: '<unset>', new: '1.0' } },
      expressions: [
        { text: '1.0', val: '1.0', type_name: 'float', start_col: 11, end_col: 14, node_type: 'Constant' }
      ]
    },
    {
      seq: 2,
      timestamp: 1718900000.003,
      kind: 'line',
      file_idx: 0,
      line: 8,
      func: 'compute_risk_score',
      depth: 1,
      src: '    age_factor = (age - 18) * 0.025',
      vars: { age: '42', bmi: '26.2', smoker: 'False', base: '1.0', age_factor: '0.6' },
      vars_diff: { age_factor: { old: '<unset>', new: '0.6' } },
      expressions: [
        { text: 'age', val: '42', type_name: 'int', start_col: 18, end_col: 21, node_type: 'Name' },
        { text: '18', val: '18', type_name: 'int', start_col: 24, end_col: 26, node_type: 'Constant' },
        { text: 'age - 18', val: '24', type_name: 'int', start_col: 18, end_col: 26, node_type: 'BinOp' },
        { text: '0.025', val: '0.025', type_name: 'float', start_col: 30, end_col: 35, node_type: 'Constant' },
        { text: '(age - 18) * 0.025', val: '0.6', type_name: 'float', start_col: 17, end_col: 35, node_type: 'BinOp' }
      ]
    },
    {
      seq: 3,
      timestamp: 1718900000.004,
      kind: 'line',
      file_idx: 0,
      line: 9,
      func: 'compute_risk_score',
      depth: 1,
      src: '    bmi_penalty = max(0.0, (bmi - 24.5) * 0.08)',
      vars: { age: '42', bmi: '26.2', smoker: 'False', base: '1.0', age_factor: '0.6', bmi_penalty: '0.136' },
      vars_diff: { bmi_penalty: { old: '<unset>', new: '0.136' } },
      expressions: [
        { text: '0.0', val: '0.0', type_name: 'float', start_col: 22, end_col: 25, node_type: 'Constant' },
        { text: 'bmi', val: '26.2', type_name: 'float', start_col: 28, end_col: 31, node_type: 'Name' },
        { text: '24.5', val: '24.5', type_name: 'float', start_col: 34, end_col: 38, node_type: 'Constant' },
        { text: 'bmi - 24.5', val: '1.7', type_name: 'float', start_col: 28, end_col: 38, node_type: 'BinOp' },
        { text: '0.08', val: '0.08', type_name: 'float', start_col: 42, end_col: 46, node_type: 'Constant' },
        { text: '(bmi - 24.5) * 0.08', val: '0.136', type_name: 'float', start_col: 27, end_col: 46, node_type: 'BinOp' },
        { text: 'max(0.0, (bmi - 24.5) * 0.08)', val: '0.136', type_name: 'float', start_col: 18, end_col: 47, node_type: 'Call' }
      ]
    },
    {
      seq: 4,
      timestamp: 1718900000.005,
      kind: 'line',
      file_idx: 0,
      line: 10,
      func: 'compute_risk_score',
      depth: 1,
      src: '    smoker_multiplier = 1.65 if smoker else 1.0',
      vars: { age: '42', bmi: '26.2', smoker: 'False', base: '1.0', age_factor: '0.6', bmi_penalty: '0.136', smoker_multiplier: '1.0' },
      vars_diff: { smoker_multiplier: { old: '<unset>', new: '1.0' } },
      expressions: [
        { text: 'smoker', val: 'False', type_name: 'bool', start_col: 32, end_col: 38, node_type: 'Name' },
        { text: '1.65 if smoker else 1.0', val: '1.0', type_name: 'float', start_col: 24, end_col: 47, node_type: 'IfExp' }
      ]
    },
    {
      seq: 5,
      timestamp: 1718900000.006,
      kind: 'line',
      file_idx: 0,
      line: 12,
      func: 'compute_risk_score',
      depth: 1,
      src: '    total_risk = (base + age_factor + bmi_penalty) * smoker_multiplier',
      vars: { age: '42', bmi: '26.2', smoker: 'False', base: '1.0', age_factor: '0.6', bmi_penalty: '0.136', smoker_multiplier: '1.0', total_risk: '1.736' },
      vars_diff: { total_risk: { old: '<unset>', new: '1.736' } },
      expressions: [
        { text: 'base', val: '1.0', type_name: 'float', start_col: 18, end_col: 22, node_type: 'Name' },
        { text: 'age_factor', val: '0.6', type_name: 'float', start_col: 25, end_col: 35, node_type: 'Name' },
        { text: 'base + age_factor', val: '1.6', type_name: 'float', start_col: 18, end_col: 35, node_type: 'BinOp' },
        { text: 'bmi_penalty', val: '0.136', type_name: 'float', start_col: 38, end_col: 49, node_type: 'Name' },
        { text: 'base + age_factor + bmi_penalty', val: '1.736', type_name: 'float', start_col: 18, end_col: 49, node_type: 'BinOp' },
        { text: 'smoker_multiplier', val: '1.0', type_name: 'float', start_col: 53, end_col: 70, node_type: 'Name' },
        { text: '(base + age_factor + bmi_penalty) * smoker_multiplier', val: '1.736', type_name: 'float', start_col: 17, end_col: 70, node_type: 'BinOp' }
      ]
    },
    {
      seq: 6,
      timestamp: 1718900000.007,
      kind: 'return',
      file_idx: 0,
      line: 13,
      func: 'compute_risk_score',
      depth: 1,
      src: '    return round(total_risk, 3)',
      vars: { total_risk: '1.736' },
      vars_diff: {},
      return_val: '1.736',
      expressions: [
        { text: 'total_risk', val: '1.736', type_name: 'float', start_col: 17, end_col: 27, node_type: 'Name' },
        { text: '3', val: '3', type_name: 'int', start_col: 29, end_col: 30, node_type: 'Constant' },
        { text: 'round(total_risk, 3)', val: '1.736', type_name: 'float', start_col: 11, end_col: 31, node_type: 'Call' }
      ]
    },

    // === Call 2: evaluate_claim_rules(claim_id="CLM-001", amount=3200.0, risk_score=1.736) ===
    {
      seq: 7,
      timestamp: 1718900000.010,
      kind: 'call',
      file_idx: 0,
      line: 16,
      func: 'evaluate_claim_rules',
      depth: 1,
      src: 'def evaluate_claim_rules(claim_id: str, amount: float, risk_score: float) -> dict[str, any]:',
      vars: { claim_id: "'CLM-001'", amount: '3200.0', risk_score: '1.736' },
      vars_diff: { claim_id: { old: '<unset>', new: "'CLM-001'" }, amount: { old: '<unset>', new: '3200.0' }, risk_score: { old: '<unset>', new: '1.736' } },
      expressions: [
        { text: 'claim_id', val: "'CLM-001'", type_name: 'str', start_col: 25, end_col: 33, node_type: 'arg' },
        { text: 'amount', val: '3200.0', type_name: 'float', start_col: 40, end_col: 46, node_type: 'arg' },
        { text: 'risk_score', val: '1.736', type_name: 'float', start_col: 55, end_col: 65, node_type: 'arg' }
      ]
    },
    {
      seq: 8,
      timestamp: 1718900000.011,
      kind: 'line',
      file_idx: 0,
      line: 18,
      func: 'evaluate_claim_rules',
      depth: 1,
      src: '    auto_approve_limit = 5000.0',
      vars: { claim_id: "'CLM-001'", amount: '3200.0', risk_score: '1.736', auto_approve_limit: '5000.0' },
      vars_diff: { auto_approve_limit: { old: '<unset>', new: '5000.0' } },
      expressions: [
        { text: '5000.0', val: '5000.0', type_name: 'float', start_col: 25, end_col: 31, node_type: 'Constant' }
      ]
    },
    {
      seq: 9,
      timestamp: 1718900000.012,
      kind: 'line',
      file_idx: 0,
      line: 19,
      func: 'evaluate_claim_rules',
      depth: 1,
      src: '    requires_manual_audit = (amount > auto_approve_limit) and (risk_score >= 1.45)',
      vars: { claim_id: "'CLM-001'", amount: '3200.0', risk_score: '1.736', requires_manual_audit: 'False' },
      vars_diff: { requires_manual_audit: { old: '<unset>', new: 'False' } },
      expressions: [
        { text: 'amount', val: '3200.0', type_name: 'float', start_col: 29, end_col: 35, node_type: 'Name' },
        { text: 'auto_approve_limit', val: '5000.0', type_name: 'float', start_col: 38, end_col: 56, node_type: 'Name' },
        { text: 'amount > auto_approve_limit', val: 'False', type_name: 'bool', start_col: 29, end_col: 56, node_type: 'Compare' },
        { text: '(amount > auto_approve_limit) and (risk_score >= 1.45)', val: 'False', type_name: 'bool', start_col: 28, end_col: 82, node_type: 'BoolOp' }
      ]
    },
    {
      seq: 10,
      timestamp: 1718900000.013,
      kind: 'line',
      file_idx: 0,
      line: 20,
      func: 'evaluate_claim_rules',
      depth: 1,
      src: '    fraud_flag = (amount > 20000.0) or (risk_score > 2.2)',
      vars: { fraud_flag: 'False' },
      vars_diff: { fraud_flag: { old: '<unset>', new: 'False' } },
      expressions: [
        { text: 'amount', val: '3200.0', type_name: 'float', start_col: 18, end_col: 24, node_type: 'Name' },
        { text: '20000.0', val: '20000.0', type_name: 'float', start_col: 27, end_col: 34, node_type: 'Constant' },
        { text: 'amount > 20000.0', val: 'False', type_name: 'bool', start_col: 18, end_col: 34, node_type: 'Compare' },
        { text: 'risk_score', val: '1.736', type_name: 'float', start_col: 40, end_col: 50, node_type: 'Name' },
        { text: '2.2', val: '2.2', type_name: 'float', start_col: 53, end_col: 56, node_type: 'Constant' },
        { text: 'risk_score > 2.2', val: 'False', type_name: 'bool', start_col: 40, end_col: 56, node_type: 'Compare' },
        { text: '(amount > 20000.0) or (risk_score > 2.2)', val: 'False', type_name: 'bool', start_col: 17, end_col: 57, node_type: 'BoolOp' }
      ]
    },
    {
      seq: 11,
      timestamp: 1718900000.014,
      kind: 'line',
      file_idx: 0,
      line: 22,
      func: 'evaluate_claim_rules',
      depth: 1,
      src: '    status = "AUDIT_REQUIRED" if requires_manual_audit else ("REJECTED" if fraud_flag else "AUTO_APPROVED")',
      vars: { status: "'AUTO_APPROVED'" },
      vars_diff: { status: { old: '<unset>', new: "'AUTO_APPROVED'" } },
      expressions: [
        { text: 'requires_manual_audit', val: 'False', type_name: 'bool', start_col: 33, end_col: 54, node_type: 'Name' },
        { text: 'fraud_flag', val: 'False', type_name: 'bool', start_col: 76, end_col: 86, node_type: 'Name' },
        { text: '"AUTO_APPROVED"', val: "'AUTO_APPROVED'", type_name: 'str', start_col: 94, end_col: 109, node_type: 'Constant' }
      ]
    },
    {
      seq: 12,
      timestamp: 1718900000.015,
      kind: 'return',
      file_idx: 0,
      line: 24,
      func: 'evaluate_claim_rules',
      depth: 1,
      src: '    return { "claim_id": claim_id, "amount": amount, "risk_score": risk_score, "status": status, "payout": amount * 0.85 }',
      vars: { claim_id: "'CLM-001'", status: "'AUTO_APPROVED'" },
      vars_diff: {},
      return_val: "{'claim_id': 'CLM-001', 'amount': 3200.0, 'risk_score': 1.736, 'status': 'AUTO_APPROVED', 'payout': 2720.0}",
      expressions: [
        { text: 'claim_id', val: "'CLM-001'", type_name: 'str', start_col: 23, end_col: 31, node_type: 'Name' },
        { text: 'amount', val: '3200.0', type_name: 'float', start_col: 43, end_col: 49, node_type: 'Name' },
        { text: 'status', val: "'AUTO_APPROVED'", type_name: 'str', start_col: 87, end_col: 93, node_type: 'Name' },
        { text: 'amount * 0.85', val: '2720.0', type_name: 'float', start_col: 105, end_col: 118, node_type: 'BinOp' }
      ]
    },

    // === Call 3: compute_risk_score(age=58, bmi=31.5, smoker=True) ===
    {
      seq: 13,
      timestamp: 1718900000.020,
      kind: 'call',
      file_idx: 0,
      line: 5,
      func: 'compute_risk_score',
      depth: 1,
      src: 'def compute_risk_score(age: int, bmi: float, smoker: bool) -> float:',
      vars: { age: '58', bmi: '31.5', smoker: 'True' },
      vars_diff: { age: { old: '<unset>', new: '58' }, bmi: { old: '<unset>', new: '31.5' }, smoker: { old: '<unset>', new: 'True' } },
      expressions: [
        { text: 'age', val: '58', type_name: 'int', start_col: 23, end_col: 26, node_type: 'arg' },
        { text: 'bmi', val: '31.5', type_name: 'float', start_col: 33, end_col: 36, node_type: 'arg' },
        { text: 'smoker', val: 'True', type_name: 'bool', start_col: 45, end_col: 51, node_type: 'arg' }
      ]
    },
    {
      seq: 14,
      timestamp: 1718900000.021,
      kind: 'line',
      file_idx: 0,
      line: 8,
      func: 'compute_risk_score',
      depth: 1,
      src: '    age_factor = (age - 18) * 0.025',
      vars: { age: '58', age_factor: '1.0' },
      vars_diff: { age_factor: { old: '<unset>', new: '1.0' } },
      expressions: [
        { text: 'age', val: '58', type_name: 'int', start_col: 18, end_col: 21, node_type: 'Name' },
        { text: 'age - 18', val: '40', type_name: 'int', start_col: 18, end_col: 26, node_type: 'BinOp' },
        { text: '(age - 18) * 0.025', val: '1.0', type_name: 'float', start_col: 17, end_col: 35, node_type: 'BinOp' }
      ]
    },
    {
      seq: 15,
      timestamp: 1718900000.022,
      kind: 'line',
      file_idx: 0,
      line: 9,
      func: 'compute_risk_score',
      depth: 1,
      src: '    bmi_penalty = max(0.0, (bmi - 24.5) * 0.08)',
      vars: { bmi: '31.5', bmi_penalty: '0.56' },
      vars_diff: { bmi_penalty: { old: '<unset>', new: '0.56' } },
      expressions: [
        { text: 'bmi', val: '31.5', type_name: 'float', start_col: 28, end_col: 31, node_type: 'Name' },
        { text: 'bmi - 24.5', val: '7.0', type_name: 'float', start_col: 28, end_col: 38, node_type: 'BinOp' },
        { text: '(bmi - 24.5) * 0.08', val: '0.56', type_name: 'float', start_col: 27, end_col: 46, node_type: 'BinOp' },
        { text: 'max(0.0, (bmi - 24.5) * 0.08)', val: '0.56', type_name: 'float', start_col: 18, end_col: 47, node_type: 'Call' }
      ]
    },
    {
      seq: 16,
      timestamp: 1718900000.023,
      kind: 'line',
      file_idx: 0,
      line: 10,
      func: 'compute_risk_score',
      depth: 1,
      src: '    smoker_multiplier = 1.65 if smoker else 1.0',
      vars: { smoker: 'True', smoker_multiplier: '1.65' },
      vars_diff: { smoker_multiplier: { old: '<unset>', new: '1.65' } },
      expressions: [
        { text: 'smoker', val: 'True', type_name: 'bool', start_col: 32, end_col: 38, node_type: 'Name' },
        { text: '1.65 if smoker else 1.0', val: '1.65', type_name: 'float', start_col: 24, end_col: 47, node_type: 'IfExp' }
      ]
    },
    {
      seq: 17,
      timestamp: 1718900000.024,
      kind: 'line',
      file_idx: 0,
      line: 12,
      func: 'compute_risk_score',
      depth: 1,
      src: '    total_risk = (base + age_factor + bmi_penalty) * smoker_multiplier',
      vars: { total_risk: '4.224' },
      vars_diff: { total_risk: { old: '<unset>', new: '4.224' } },
      expressions: [
        { text: 'base + age_factor + bmi_penalty', val: '2.56', type_name: 'float', start_col: 18, end_col: 49, node_type: 'BinOp' },
        { text: 'smoker_multiplier', val: '1.65', type_name: 'float', start_col: 53, end_col: 70, node_type: 'Name' },
        { text: '(base + age_factor + bmi_penalty) * smoker_multiplier', val: '4.224', type_name: 'float', start_col: 17, end_col: 70, node_type: 'BinOp' }
      ]
    },
    {
      seq: 18,
      timestamp: 1718900000.025,
      kind: 'return',
      file_idx: 0,
      line: 13,
      func: 'compute_risk_score',
      depth: 1,
      src: '    return round(total_risk, 3)',
      vars: { total_risk: '4.224' },
      vars_diff: {},
      return_val: '4.224',
      expressions: [
        { text: 'total_risk', val: '4.224', type_name: 'float', start_col: 17, end_col: 27, node_type: 'Name' },
        { text: 'round(total_risk, 3)', val: '4.224', type_name: 'float', start_col: 11, end_col: 31, node_type: 'Call' }
      ]
    }
  ]
};
