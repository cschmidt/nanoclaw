---
name: gcalcli-calendar
description: Read/search/manage Google Calendar via gcalcli CLI
user_invocable: false
---

Use `gcalcli` to read/search/manage Google Calendar with minimal tool calls and minimal output.

## Rules

### CLI flag placement (critical)
- Global flags (`--nocolor`, `--calendar`) go BEFORE the subcommand
- Subcommand-specific flags go AFTER the subcommand name
- Example: `gcalcli --nocolor delete --iamaexpert "query" start end`
- Applies to ALL subcommand flags: `--iamaexpert` (delete), `--noprompt`/`--allday` (add), `--use-legacy-import` (import)

### Output & language
- Don't print CLI commands unless explicitly requested
- If asked for commands: print ALL executed commands in order
- Don't mix languages within one reply
- Be concise. No scope unless nothing found

### Dates & formatting
- Human-friendly dates by default. ISO only if explicitly requested
- Don't quote event titles unless needed to disambiguate

### Calendar scope
- Trust gcalcli config. Don't broaden scope unless user asks "across all calendars"

### Agenda (today-only by default)
- If user asks "agenda" without a period, return today only
- Expand only if explicitly asked

### Weekday requests (no mental math)
- Fetch next 14 days agenda once
- Pick matching day/event from tool output
- Proceed or disambiguate if multiple

### Finding events: prefer deterministic agenda scan (meaning-first)
- Prefer `agenda` over `search`
- Use bounded window and match events by meaning
- Default locate windows vary by specificity
- Use `search` only as fallback for large time windows or explicit requests

### Search (bounded)
- Default search window: next ~180 days
- If no matches: say "No matches in next ~6 months" and offer to expand
- Show scope only when nothing is found

### Tool efficiency
- Default: use `--nocolor` to reduce tokens
- Use `--tsv` only if you must parse/dedupe/sort

## Actions policy (optimized for conversational speed)

Designed for personal assistant use with fast, low-friction management.

### Unambiguous actions: execute immediately
For cancel/delete/edit actions, skip confirmation when ALL hold:
- User explicitly requested the action
- Exactly one event matches in tight time window
- Match is unambiguous

### Ambiguous actions: always ask first
- Ask short disambiguation question listing candidates
- Wait for user's choice

### Create events: overlap check MUST be cross-calendar
- Always run best-effort overlap check across ALL non-ignored calendars
- Scan agenda WITHOUT `--calendar`
- If overlap exists: ask for confirmation
- If no overlap: create immediately

### Choose the right create method
- **`add`** — default for one-off events
- **`import` via stdin** — use ONLY for recurrence/free-busy; pipe ICS via stdin; NEVER write temp files
- **`quick`** — avoid unless user explicitly asks

### Deletes must be verified
- Use non-interactive delete with `--iamaexpert`
- Always verify via agenda in same tight window
- If still present, retry with `--refresh`
- Never claim success unless verification confirms removal

## Canonical commands

### Agenda (deterministic listing)
- Today: `gcalcli --nocolor agenda today tomorrow`
- Next 14d: `gcalcli --nocolor agenda today +14d`
- Next 30d: `gcalcli --nocolor agenda today +30d`
- Custom: `gcalcli --nocolor agenda <start> <end>`

### Search (fallback / explicit request)
- Default: `gcalcli --nocolor search "<query>" today +180d`
- Custom: `gcalcli --nocolor search "<query>" <start> <end>`

### Create — `add` (one-off events)
- Overlap preflight: `gcalcli --nocolor agenda <start> <end>` (WITHOUT `--calendar`)
- Timed: `gcalcli --nocolor --calendar "<Cal>" add --noprompt --title "<Title>" --when "<Start>" --duration <minutes>`
- All-day: `gcalcli --nocolor --calendar "<Cal>" add --noprompt --allday --title "<Title>" --when "<Date>"`
- Reminders: `--reminder "20160 popup"` (14d), `--reminder "10080 popup"` (7d), `--reminder "0 popup"` (start)

### Create — `import` via stdin (recurrence / free/busy)
Pipe ICS directly via stdin — never write temp files:
- Use `DTSTART;VALUE=DATE:YYYYMMDD` for all-day
- Use `RRULE:FREQ=YEARLY` for recurrence
- `TRANSP:TRANSPARENT` = free; `TRANSP:OPAQUE` = busy
- One import call = one event
- All flags go AFTER `import`

### Delete (with post-delete verification)
- Locate via agenda
- Delete: `gcalcli --nocolor delete --iamaexpert "<query>" <start> <end>`
- Verify: `gcalcli --nocolor agenda <dayStart> <dayEnd>`
- Optional retry: `gcalcli --nocolor --refresh agenda <dayStart> <dayEnd>`

### Edit / Modify existing events
- `gcalcli edit` is interactive — cannot be used in non-interactive exec
- Delete + recreate for property changes
