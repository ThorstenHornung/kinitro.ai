#!/usr/bin/env python3
"""kinitro.ai briefing for sessions that run no hooks module (plain claude.ai chats, Cowork chats).

Command hooks only. This script never calls an MCP server and never holds a credential:
the agent fetches its briefing through the kinitro connector (its own sign-in), and this
script caches the text from the tool answer and re-injects it on later turns.

Three events (hooks.json):
  SessionStart     first instructions, or the bootstrap when nothing is cached yet
  UserPromptSubmit the per-turn block from the cache
  PostToolUse      captures domain and briefing text from a kinitro tool answer

Stand-down: where the kinitro plugin (hooks module) drives this session, it keeps a session
record under ~/.kinitro-ai/sessions/<session id>.json. This script then stays silent, so the
agent never gets two briefings. Item 4.2.1-4696, PO decision 20.11.2026.
"""
import json
import os
import sys
import time

STATE_DIR = os.path.join(os.path.expanduser("~"), ".kinitro-cloud")
MODULE_DIR = os.path.join(os.path.expanduser("~"), ".kinitro-ai", "sessions")
FRESH_SECONDS = 15 * 60          # a heartbeat older than this counts as a leftover, not a live plugin
GRACE_SECONDS = 120              # a record with no heartbeat yet: treat as live for this long (first turn)
CACHE_LIMIT = 8000               # characters of briefing text kept for re-injection

BOOTSTRAP = (
    "[kinitro-cloud] This session has no kinitro briefing yet. Before answering, call the kinitro verb "
    "open-domain (no arguments lets the person choose), then get-briefing with moment 'start', and "
    "keep its instructions for the session. Pass the session key from open-domain as domainRef on "
    "every later kinitro call. Chat mirroring is not available in this kind of session."
)


def read_input():
    try:
        return json.loads(sys.stdin.read() or "{}")
    except Exception:
        return {}


def state_path(session_id):
    return os.path.join(STATE_DIR, "%s.json" % session_id) if session_id else None


def load_state(session_id):
    p = state_path(session_id)
    if not p:
        return {}
    try:
        with open(p, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except Exception:
        return {}


def save_state(session_id, state):
    p = state_path(session_id)
    if not p:
        return
    try:
        os.makedirs(STATE_DIR, exist_ok=True)
        os.chmod(STATE_DIR, 0o700)
    except Exception:
        pass
    try:
        with open(p, "w", encoding="utf-8") as fh:
            json.dump(state, fh)
        os.chmod(p, 0o600)
    except Exception:
        pass


def module_drives(session_id):
    """True while the kinitro plugin's hooks module runs this session."""
    if not session_id:
        return False
    p = os.path.join(MODULE_DIR, "%s.json" % session_id)
    try:
        if not os.path.exists(p):
            return False
        with open(p, "r", encoding="utf-8") as fh:
            rec = json.load(fh)
        turn_at = rec.get("turnAt")
        if turn_at:
            stamp = time.mktime(time.strptime(turn_at[:19], "%Y-%m-%dT%H:%M:%S")) - time.timezone
            return (time.time() - stamp) <= FRESH_SECONDS
        # no heartbeat yet: the record may have been created moments ago, on this very turn,
        # by a module whose hook ran first. A record older than the grace period is a leftover
        # (the module is switched off or inert), and then this plugin briefs the session.
        return (time.time() - os.path.getmtime(p)) <= GRACE_SECONDS
    except Exception:
        return False


def answer_text(response):
    """The text of a tool answer, whatever shape the host wraps it in."""
    if isinstance(response, str):
        return response
    if isinstance(response, list):                       # MCP content blocks: [{"type": "text", "text": ...}]
        return "".join(b.get("text", "") for b in response if isinstance(b, dict))
    if isinstance(response, dict):
        content = response.get("content")
        if isinstance(content, list):
            return "".join(b.get("text", "") for b in content if isinstance(b, dict))
        for key in ("text", "result", "output"):
            if isinstance(response.get(key), str):
                return response[key]
    try:
        return json.dumps(response)
    except Exception:
        return ""


TEXT_KEYS = ("text", "body", "markdown", "md", "content", "instructions", "briefing", "persona", "value")


def readable(node, out):
    """Collect the human-readable strings of a tool answer, in the order they appear."""
    if isinstance(node, str):
        if node.strip():
            out.append(node.strip())
    elif isinstance(node, list):
        for item in node:
            readable(item, out)
    elif isinstance(node, dict):
        if "result" in node and len(node) <= 3:            # {status, result} envelope
            readable(node["result"], out)
            return
        for key in TEXT_KEYS:
            if key in node:
                readable(node[key], out)


def briefing_body(text):
    """The briefing as a person would read it. A tool answer is JSON, and storing it raw put
    escaped \\u0060 and \\n in front of the agent (finding 25.11.2026)."""
    try:
        parsed = json.loads(text)
    except Exception:
        return text.strip()
    if isinstance(parsed, dict) and isinstance(parsed.get("text"), str) and parsed["text"].strip():
        return parsed["text"].strip()                    # the assembled briefing; instructions[] repeats it
    parts = []
    readable(parsed, parts)
    return "\n\n".join(parts) if parts else text.strip()


def shorten(body, limit):
    """Cut on a line boundary: a cut inside the text can drop half a rule."""
    if len(body) <= limit:
        return body
    cut = body[:limit]
    nl = cut.rfind("\n")
    if nl > limit // 2:
        cut = cut[:nl]
    return cut.rstrip() + "\n\n[kinitro-cloud] (instructions shortened; ask for the rest with get-briefing)"


def capture(data, state):
    """Keep what a kinitro tool answer carries: the domain and the seat's instructions.

    The session key is deliberately NOT kept: this script cannot call MCP, so it has no use
    for a credential, and a file that holds none cannot leak one.
    """
    tool = str(data.get("tool_name") or "")
    text = answer_text(data.get("tool_response"))
    if not text:
        return state
    verb = tool.rsplit("__", 1)[-1]
    if verb in ("open-domain", "current-seat"):
        try:
            parsed = json.loads(text)
            node = parsed.get("result", parsed) if isinstance(parsed, dict) else {}
            for key in ("domainName", "domain", "domainCode"):
                val = node.get(key)
                if isinstance(val, dict):
                    val = val.get("name")
                if isinstance(val, str) and val.strip():
                    state["domain"] = val
                    break
        except Exception:
            pass
    if verb in ("get-briefing", "get-procedure", "memory-resolve"):
        state["instructions"] = shorten(briefing_body(text), CACHE_LIMIT)
        state["briefedAt"] = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    return state


def block(state, event):
    """The text put in front of the agent this turn."""
    if not state.get("instructions"):
        return BOOTSTRAP
    head = "[kinitro-cloud] %s · mirror not available in this session" % (state.get("domain") or "kinitro.ai")
    lines = [head, "", state["instructions"]]
    if event == "SessionStart":
        lines.append("")
        lines.append("[kinitro-cloud] These instructions come from this session's cache. Call get-briefing again if they look stale.")
    return "\n".join(lines)


def main():
    data = read_input()
    event = data.get("hook_event_name") or ""
    session_id = data.get("session_id") or ""

    if module_drives(session_id):
        return 0                                   # the kinitro plugin is briefing this session

    state = load_state(session_id)

    if event == "PostToolUse":
        save_state(session_id, capture(data, state))
        return 0

    if event in ("SessionStart", "UserPromptSubmit"):
        state["turns"] = int(state.get("turns") or 0) + 1
        save_state(session_id, state)
        print(json.dumps({
            "hookSpecificOutput": {
                "hookEventName": event,
                "additionalContext": block(state, event),
            }
        }))
    return 0


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        sys.exit(0)                                # a hook never breaks a turn
