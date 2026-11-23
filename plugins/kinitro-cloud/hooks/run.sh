#!/bin/sh
# Launcher: this plugin may reach a Windows terminal through an account sync, where `python3` does not exist.
# Tries python3, then python, then py; stays silent and succeeds when none is found (a hook must never break a turn).
D=$(dirname "$0")
for P in python3 python py; do
  if command -v "$P" >/dev/null 2>&1; then exec "$P" "$D/kinitro_cloud.py"; fi
done
exit 0
