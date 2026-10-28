#!/usr/bin/env python3
"""GET one URL the way Chrome would, and hand the body to the Node poller.

EA's edge (Akamai Bot Manager) fingerprints the TLS handshake and answers
403 to Node's own fetch. curl_cffi impersonates Chrome's handshake, exactly as
the old Python site did (proclubs/ea_client.py). src/lib/ea-client.ts runs this
as a subprocess, one call per request:

    ea_fetch.py URL [key=value ...]      # key=value pairs become the query string

Exit codes (stdout carries the response body; stderr one status line):
    0   HTTP 2xx. The body is on stdout (empty for EA's "no data" 200).
    10  Any other HTTP status. stderr: "status=<code> retry_after=<seconds or ->".
    11  Could not reach EA (DNS, timeout, TLS). stderr: the reason.
    12  curl_cffi is not installed. stderr: how to fix it.
    64  Bad usage.
"""
import sys

IMPERSONATE = "chrome124"
TIMEOUT = 15


def main(argv):
    if len(argv) < 2:
        print("usage: ea_fetch.py URL [key=value ...]", file=sys.stderr)
        return 64
    url, params = argv[1], {}
    for pair in argv[2:]:
        key, sep, value = pair.partition("=")
        if not sep or not key:
            print(f"bad parameter {pair!r}, expected key=value", file=sys.stderr)
            return 64
        params[key] = value

    try:
        from curl_cffi import requests
    except ImportError:
        print("curl_cffi is not installed: pip install curl_cffi in the venv EA_PYTHON points at", file=sys.stderr)
        return 12

    try:
        resp = requests.get(url, params=params, impersonate=IMPERSONATE, timeout=TIMEOUT)
    except Exception as exc:  # curl_cffi raises its own RequestException family
        print(f"{type(exc).__name__}: {exc}", file=sys.stderr)
        return 11

    if 200 <= resp.status_code < 300:
        sys.stdout.write(resp.text)
        return 0
    print(f"status={resp.status_code} retry_after={resp.headers.get('retry-after') or '-'}", file=sys.stderr)
    return 10


if __name__ == "__main__":
    sys.exit(main(sys.argv))
