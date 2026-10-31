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
 * Checks if a return value represents an intermediate asyncio Future/coroutine suspension.
 */
export const isFuturePending = (val: string | null | undefined): boolean => {
  if (!val) return false;
  return val.includes('<Future pending') || val === '(awaiting)' || val.includes('<coroutine ');
};

/**
 * Groups a flat trace event stream into structured function-call records:
 * args captured at entry, return value / exception at exit, duration
 * and every captured sub-expression in between. Seamlessly unrolls and merges
 * async coroutine await/resumption cycles so developers see real resolved return values.
 */
export function buildCallRecords(session: TraceSession): CallRecord[] {
  if (!session || !session.events || !Array.isArray(session.events)) {
    return [];
  }
  const records: CallRecord[] = [];
  const stack: OpenFrame[] = [];

  const finalize = (frame: OpenFrame, endSeq: number, end: number) => {
    let retVal: string | null = null;
    let excType: string | null = null;
    let excVal: string | null = null;

    // Scan backwards for real return or exception
    for (let i = frame.events.length - 1; i >= 0; i--) {
      const e = frame.events[i];
      if (e.exc_type && e.exc_type !== 'StopIteration' && e.exc_type !== 'GeneratorExit') {
        excType = e.exc_type;
        excVal = e.exc_val || null;
        break;
      }
      if (e.return_val && !isFuturePending(e.return_val)) {
        retVal = e.return_val;
        break;
      }
    }

    if (!retVal && !excType) {
      const lastEv = frame.events[frame.events.length - 1];
      const rawRet = lastEv?.return_val || null;
      retVal = isFuturePending(rawRet) ? null : rawRet;
      excType = lastEv?.exc_type || null;
      excVal = lastEv?.exc_val || null;
    }

    records.push({
      id: `call-${frame.startSeq}-${frame.func}`,
      func: frame.func,
      file_idx: frame.file_idx,
      startSeq: frame.startSeq,
      endSeq,
      callLine: frame.callLine,
      args: frame.args,
      return_val: retVal,
      exc_type: excType,
      exc_val: excVal,
      duration_ms: Math.max(0.01, (end - frame.startTime) * 1000),
      events: frame.events,
      expressions: frame.events.flatMap((e) => e.expressions || []),
    });
  };

  session.events.forEach((ev) => {
    if (ev.kind === 'call') {
      const top = stack[stack.length - 1];
      // If the top frame is the same coroutine resuming after an await, keep in the same frame
      if (top && top.func === ev.func && top.file_idx === ev.file_idx) {
        top.events.push(ev);
        return;
      }

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

    if (ev.kind === 'return') {
      // Don't close frame if it's just an internal coroutine await suspension
      if (isFuturePending(ev.return_val)) {
        return;
      }
      const frame = stack.pop();
      if (frame) finalize(frame, ev.seq, ev.timestamp);
    } else if (ev.kind === 'exception') {
      // Ignore StopIteration/GeneratorExit asyncio internal control flow
      if (ev.exc_type === 'StopIteration' || ev.exc_type === 'GeneratorExit') {
        return;
      }
      const frame = stack.pop();
      if (frame) finalize(frame, ev.seq, ev.timestamp);
    }
  });

  // Frames left open (including async coroutines that suspended and finished)
  stack.forEach((frame) => {
    finalize(frame, frame.startSeq, frame.events[frame.events.length - 1]?.timestamp ?? frame.startTime);
  });

  // Consolidate any fragmented runs of the same function call in async loops
  const consolidated: CallRecord[] = [];
  records.forEach((rec) => {
    const prev = consolidated[consolidated.length - 1];
    if (
      prev &&
      prev.func === rec.func &&
      prev.file_idx === rec.file_idx &&
      isFuturePending(prev.return_val)
    ) {
      prev.endSeq = rec.endSeq;
      prev.return_val = rec.return_val;
      prev.exc_type = rec.exc_type;
      prev.exc_val = rec.exc_val;
      prev.events.push(...rec.events);
      prev.expressions.push(...rec.expressions);
    } else {
      consolidated.push(rec);
    }
  });

  return consolidated.sort((a, b) => a.startSeq - b.startSeq);
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
