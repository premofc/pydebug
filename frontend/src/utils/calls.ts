import type { TraceEvent, TraceSession, SubExpression } from '../types';

export interface CallRecord {
  id: string;
  func: string;
  file_idx: number;
  startSeq: number;
  endSeq: number;
  callLine: number;
  args: Record<string, string>;
  return_val: string | null;
  exc_type: string | null;
  exc_val: string | null;
  duration_ms: number;
  events: TraceEvent[];
  expressions: SubExpression[];
}

interface OpenFrame {
  func: string;
  file_idx: number;
  startSeq: number;
  startTime: number;
  callLine: number;
  args: Record<string, string>;
  events: TraceEvent[];
}

  /**
   * Groups a flat trace event stream into structured function-call records:
   * args captured at entry, return value / exception at exit, duration
   * and every captured sub-expression in between.
   */
export function buildCallRecords(session: TraceSession): CallRecord[] {
  const records: CallRecord[] = [];
  const stack: OpenFrame[] = [];

  const finalize = (frame: OpenFrame, endSeq: number, end: number) => {
    const lastEv = frame.events[frame.events.length - 1];
    records.push({
      id: `call-${frame.startSeq}-${frame.func}`,
      func: frame.func,
      file_idx: frame.file_idx,
      startSeq: frame.startSeq,
      endSeq,
      callLine: frame.callLine,
      args: frame.args,
      return_val: lastEv?.return_val || null,
      exc_type: lastEv?.exc_type || null,
      exc_val: lastEv?.exc_val || null,
      duration_ms: Math.max(0.01, (end - frame.startTime) * 1000),
      events: frame.events,
      expressions: frame.events.flatMap((e) => e.expressions || []),
    });
  };

  session.events.forEach((ev) => {
    if (ev.kind === 'call') {
      stack.push({
        func: ev.func,
        file_idx: ev.file_idx,
        startSeq: ev.seq,
        startTime: ev.timestamp,
        callLine: ev.line,
        args: { ...ev.vars },
        events: [ev],
      });
      return;
    }

    const top = stack[stack.length - 1];
    if (top) top.events.push(ev);

    if (ev.kind === 'return' || ev.kind === 'exception') {
      const frame = stack.pop();
      if (frame) finalize(frame, ev.seq, ev.timestamp);
    }
  });

  // Frames left open (e.g. a session captured mid-execution)
  stack.forEach((frame) => {
    finalize(frame, frame.startSeq, frame.events[frame.events.length - 1]?.timestamp ?? frame.startTime);
  });

  return records.sort((a, b) => a.startSeq - b.startSeq);
}

/** Maps source line number -> expressions evaluated on that line during a call. */
export function buildLineExprs(call: CallRecord | null): Map<number, SubExpression[]> {
  const map = new Map<number, SubExpression[]>();
  if (!call) return map;
  call.events.forEach((ev) => {
    if (ev.expressions && ev.expressions.length > 0) {
      map.set(ev.line, [...(map.get(ev.line) || []), ...ev.expressions]);
    }
  });
  return map;
}
