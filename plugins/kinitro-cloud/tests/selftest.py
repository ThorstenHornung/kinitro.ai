#!/usr/bin/env python3
"""Self-test for the kinitro-cloud hook script. Run: python3 tests/selftest.py

Each case runs the hook as the host runs it: a JSON object on stdin, output on stdout.
HOME points at a throwaway folder, so nothing of the real session is touched.
"""
import json, os, subprocess, sys, tempfile, time

HOOK = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "hooks", "kinitro_cloud.py")
fails = []


def run(home, payload):
    env = dict(os.environ, HOME=home, USERPROFILE=home)
    p = subprocess.run([sys.executable, "-I", HOOK], input=json.dumps(payload),
                       capture_output=True, text=True, env=env)
    return p.stdout.strip()


def module_record(home, sid, turn_at=None, age_seconds=0):
    d = os.path.join(home, ".kinitro-ai", "sessions")
    os.makedirs(d, exist_ok=True)
    p = os.path.join(d, "%s.json" % sid)
    rec = {"sessionId": sid, "home": "/w", "domain": "beta", "startedAt": "2026-11-23T09:00:00Z"}
    if turn_at:
        rec["turnAt"] = turn_at
    with open(p, "w") as fh:
        json.dump(rec, fh)
    if age_seconds:
        old = time.time() - age_seconds
        os.utime(p, (old, old))
    return p


def check(name, got, want_briefing):
    briefed = got.startswith("{")
    if briefed != want_briefing:
        fails.append("%s: expected %s, got %r" % (name, "a briefing" if want_briefing else "silence", got[:120]))
    else:
        print("  ok  %s" % name)


def utc(offset=0):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - offset))


print("kinitro-cloud self-test")
with tempfile.TemporaryDirectory() as home:
    prompt = {"hook_event_name": "UserPromptSubmit", "session_id": "A1"}

    check("no module record: this plugin briefs", run(home, prompt), True)

    module_record(home, "A1", turn_at=utc(5))
    check("fresh heartbeat: stands down", run(home, prompt), False)

    module_record(home, "A1", turn_at=utc(60 * 60))
    check("stale heartbeat: briefs again", run(home, prompt), True)

    module_record(home, "A1")                       # no heartbeat, written just now
    check("no heartbeat, record new: stands down for the grace period", run(home, prompt), False)

    module_record(home, "A1", age_seconds=600)      # no heartbeat, old record = leftover
    check("no heartbeat, record old: briefs", run(home, prompt), True)

with tempfile.TemporaryDirectory() as home:
    sid = "B2"
    run(home, {"hook_event_name": "PostToolUse", "session_id": sid,
               "tool_name": "mcp__claude_ai_Kinitro__get-briefing",
               "tool_response": {"content": [{"type": "text", "text": "Seat: Architect. Measure, never assume."}]}})
    run(home, {"hook_event_name": "PostToolUse", "session_id": sid,
               "tool_name": "mcp__kinitro_ai__open-domain",
               "tool_response": {"content": [{"type": "text", "text": json.dumps({"result": {"domainName": "MethOS", "sessionKey": "KEY-SHOULD-NEVER-BE-STORED"}})}]}})
    out = run(home, {"hook_event_name": "UserPromptSubmit", "session_id": sid})
    ctx = json.loads(out)["hookSpecificOutput"]["additionalContext"]
    if "Measure, never assume." not in ctx:
        fails.append("the cached briefing is not re-injected")
    else:
        print("  ok  the briefing from the agent's own call is re-injected next turn")
    if "MethOS" not in ctx:
        fails.append("the domain name is not shown")
    else:
        print("  ok  the domain name is shown")
    if "mirror not available" not in ctx:
        fails.append("the missing mirror is not stated")
    else:
        print("  ok  the missing mirror is stated once")
    blob = open(os.path.join(home, ".kinitro-cloud", "%s.json" % sid)).read()
    if "KEY-SHOULD-NEVER-BE-STORED" in blob:
        fails.append("THE SESSION KEY WAS WRITTEN TO THE STATE FILE")
    else:
        print("  ok  the session key is in no file")
    mode = oct(os.stat(os.path.join(home, ".kinitro-cloud", "%s.json" % sid)).st_mode & 0o777)
    if mode != "0o600":
        fails.append("state file mode is %s, expected 0o600" % mode)
    else:
        print("  ok  the state file is readable by its owner only")

# findings of 25.11.2026, reported from a live cloud chat
with tempfile.TemporaryDirectory() as home:
    sid = "C3"
    envelope = json.dumps({"status": "ok", "result": {"instructions": [
        {"text": "Rule 1: read Notes at session start."},
        {"text": "Rule 2: open with the agenda items that are due."}]}})
    run(home, {"hook_event_name": "PostToolUse", "session_id": sid,
               "tool_name": "mcp__kinitro_ai__get-briefing",
               "tool_response": {"content": [{"type": "text", "text": envelope}]}})
    ctx = json.loads(run(home, {"hook_event_name": "UserPromptSubmit", "session_id": sid}))["hookSpecificOutput"]["additionalContext"]
    if "Rule 1: read Notes at session start." not in ctx or "Rule 2" not in ctx:
        fails.append("the briefing text is not unpacked from the tool answer")
    elif '{"' in ctx or "\\u" in ctx or '"text":' in ctx:
        fails.append("the cache still holds raw JSON: %r" % ctx[:120])
    else:
        print("  ok  the briefing is cached as readable text, not as the raw tool answer")

    for line in ctx.splitlines():
        if line.startswith("[") and not line.startswith("[kinitro-cloud]"):
            fails.append("a line uses another prefix and reads as the other plugin: %r" % line[:60])
            break
    else:
        print("  ok  every line this plugin adds carries one prefix")

with tempfile.TemporaryDirectory() as home:
    sid = "C4"
    long_rules = "\n".join("Rule %d: a sentence that must survive whole, not be cut in half." % i for i in range(1, 400))
    run(home, {"hook_event_name": "PostToolUse", "session_id": sid,
               "tool_name": "mcp__kinitro_ai__get-briefing",
               "tool_response": {"content": [{"type": "text", "text": json.dumps({"result": {"text": long_rules}})}]}})
    ctx = json.loads(run(home, {"hook_event_name": "UserPromptSubmit", "session_id": sid}))["hookSpecificOutput"]["additionalContext"]
    body = ctx.split("shortened")[0]
    rules = [l for l in body.strip().splitlines() if l.startswith("Rule ")]
    last = rules[-1] if rules else ""
    if not last:
        fails.append("no readable rule survived the shortening: %r" % body[:80])
    elif not last.endswith("."):
        fails.append("the cut fell inside a line: %r" % last[-60:])
    else:
        print("  ok  a shortened briefing is cut on a line boundary")

# findings of 25.11.2026 21:18, measured against the real answer shapes in a live cloud chat
with tempfile.TemporaryDirectory() as home:
    sid = "D5"
    briefing = json.dumps({"text": "Rule 1: read Notes at session start.",
                           "instructions": [{"text": "Rule 1: read Notes at session start."}]})
    run(home, {"hook_event_name": "PostToolUse", "session_id": sid,
               "tool_name": "mcp__kinitro_ai__get-briefing",
               "tool_response": [{"type": "text", "text": briefing}]})      # a bare LIST, as the host sends it
    run(home, {"hook_event_name": "PostToolUse", "session_id": sid,
               "tool_name": "mcp__kinitro_ai__open-domain",
               "tool_response": [{"type": "text", "text": json.dumps({"domain": {"id": "x", "name": "Supply Chain Demo"}})}]})
    ctx = json.loads(run(home, {"hook_event_name": "UserPromptSubmit", "session_id": sid}))["hookSpecificOutput"]["additionalContext"]

    if '{"' in ctx or '\\u' in ctx or '"text":' in ctx:
        fails.append("a list-shaped tool answer still reaches the agent as raw JSON: %r" % ctx[:120])
    else:
        print("  ok  a tool answer sent as content blocks is decoded")

    if ctx.count("Rule 1: read Notes at session start.") != 1:
        fails.append("the briefing is stored %d times, not once" % ctx.count("Rule 1: read Notes at session start."))
    else:
        print("  ok  a briefing carried twice in one answer is cached once")

    if "Supply Chain Demo" not in ctx:
        fails.append("the domain name is not read from {id, name}: %r" % ctx.splitlines()[0][:80])
    else:
        print("  ok  the domain name is read from the open-domain answer")

if fails:
    print("\nFAILED:")
    for f in fails:
        print(" -", f)
    sys.exit(1)
print("\nall cases pass")
