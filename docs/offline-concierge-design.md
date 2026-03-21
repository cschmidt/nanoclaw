# Offline Concierge ("Intern Agent") Design

## Problem

When the Claude API is unavailable (rate limits, outages, offline), all agents go silent. There's no graceful degradation — messages queue up and get lost or bloat sessions.

## Proposal: Shift-Change Model

A local LLM (via Ollama) acts as a backup agent that covers when the primary API is down. It doesn't pretend to be CLARA — it's a separate identity with clear, reduced expectations.

## How It Works

### Activation
- Health check pings Claude API every N minutes
- On failure, routing flips to the local model agent
- On recovery, routing flips back to primary

### The Intern's Job
- Acknowledge messages ("Got it, I'll make sure CLARA sees this")
- Basic triage and tagging (urgent vs. routine)
- Simple lookups against the Obsidian vault
- Queue complex requests for when primary is back
- Write everything down

### Handoff Protocol
- Intern writes to `/workspace/group/handoff.md` during its shift:
  - Messages received with timestamps
  - What it handled (and how)
  - What's queued for the primary agent
  - Any context or notes
- When primary comes back online, system prompt includes: "Check for handoff notes first"
- Primary reads handoff, processes queued items, deletes the file

### Identity
- Separate bot identity in Telegram (not pretending to be CLARA)
- Own trigger pattern, own name
- Prompt: "You're covering for CLARA. Keep things moving. Write everything down."
- Users naturally adjust expectations — you don't dump 30 URLs on the intern

## Architecture Sketch

```
API Health Check (cron, every 2-5 min)
  ├─ API up   → route to Claude (CLARA/SCOUT/ARCHITECT)
  └─ API down → route to Ollama (intern agent)
                  ├─ triage + acknowledge
                  ├─ simple tasks (vault lookup, tagging)
                  └─ write handoff.md for complex items

On recovery:
  Primary reads handoff.md → processes queue → deletes file
```

## Three-Tier Model (Future)

| Tier | Model | Role | When |
|------|-------|------|------|
| Local | Ollama (7B-14B) | Always-on concierge, triage, acknowledgment | Offline, rate-limited, simple tasks |
| Mid | Sonnet | Routine work, URL processing, daily briefings | Default for high-volume agents |
| Top | Opus | Deep analysis, architecture, critical thinking | Complex tasks, self-improve |

## Prerequisites
- Local LLM running via Ollama (see `/add-ollama-tool` skill)
- Experience with local model capabilities and limitations
- Health check mechanism for API availability

## Open Questions
- What's the minimum viable local model for concierge duty? (Needs to parse messages, write notes, do basic vault search)
- Should each agent have its own intern, or one shared concierge?
- How to handle the edge case where API flaps (up/down/up quickly)?
- Should the intern be able to escalate to the API for a single critical request even in "offline" mode (retry with backoff)?
