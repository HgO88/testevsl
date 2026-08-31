#!/usr/bin/env python3
"""Energy-envelope cross-correlation between two audio windows.

Measures how far REF's audio at time t_ref sits from TEST's audio at t_test.
No numpy in this container, so the envelope is plain python: RMS over 2ms bins.

Trap this exists to avoid: a reference excerpt that spans a cut has a different
envelope shape than the same nominal window in a cut file, and the correlation
locks onto a spurious peak. Always take the reference from INSIDE one
continuous cutlist segment.
"""
import math
import struct
import subprocess
import sys

SR = 8000
BIN = 0.002  # 2ms
BIN_N = int(SR * BIN)


def pcm(path, start, dur):
    raw = subprocess.run(
        ["ffmpeg", "-v", "error", "-ss", f"{start:.4f}", "-t", f"{dur:.4f}",
         "-i", path, "-ac", "1", "-ar", str(SR), "-f", "s16le", "-"],
        capture_output=True, check=True).stdout
    return struct.unpack(f"<{len(raw) // 2}h", raw[: len(raw) // 2 * 2])


def envelope(s):
    return [math.sqrt(sum(v * v for v in s[i:i + BIN_N]) / BIN_N) if s[i:i + BIN_N] else 0.0
            for i in range(0, len(s) - BIN_N + 1, BIN_N)]


def norm(e):
    m = sum(e) / len(e)
    c = [v - m for v in e]
    n = math.sqrt(sum(v * v for v in c)) or 1.0
    return [v / n for v in c]


def offset(ref_path, ref_at, test_path, test_at, win=4.0, search=6.0):
    """Returns seconds TEST lags REF (positive = test is late)."""
    ref = norm(envelope(pcm(ref_path, ref_at, win)))
    test = norm(envelope(pcm(test_path, max(0, test_at - search), win + 2 * search)))
    best, best_lag = -2.0, 0
    for lag in range(len(test) - len(ref) + 1):
        s = sum(ref[i] * test[lag + i] for i in range(len(ref)))
        if s > best:
            best, best_lag = s, lag
    return (best_lag * BIN) - min(search, test_at), best


if __name__ == "__main__":
    ref_path, test_path = sys.argv[1], sys.argv[2]
    for t in [float(x) for x in sys.argv[3:]]:
        off, score = offset(ref_path, t, test_path, t)
        verdict = "OK" if abs(off) <= 0.060 else "FORA"
        print(f"t={t:8.1f}s  offset={off * 1000:+8.1f}ms  r={score:.3f}  {verdict}")
