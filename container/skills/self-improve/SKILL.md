# Self-Improvement — Modifying NanoClaw

You can modify NanoClaw's source code on the host by writing an IPC request file.
The host picks it up, runs Claude Code in a git worktree, builds, tests, and
writes the result back.

## How to Invoke

Write a JSON file to `/workspace/ipc/tasks/` and poll `/workspace/ipc/responses/`
for the result. Use this Bash pattern:

```bash
# Generate a unique request ID
REQUEST_ID="si-$(date +%s)-$(head -c 4 /dev/urandom | xxd -p)"
RESPONSE_FILE="/workspace/ipc/responses/${REQUEST_ID}.json"

# Write the IPC request (atomic write)
cat > "/workspace/ipc/tasks/${REQUEST_ID}.json.tmp" << 'IPCEOF'
{
  "type": "claude_code",
  "requestId": "REQUEST_ID_PLACEHOLDER",
  "prompt": "YOUR PROMPT HERE — be specific about files and changes",
  "dryRun": true,
  "autoRestart": false,
  "responseFile": "RESPONSE_FILE_PLACEHOLDER",
  "groupFolder": "YOUR_GROUP_FOLDER",
  "timestamp": "TIMESTAMP_PLACEHOLDER"
}
IPCEOF

# Fix placeholders and make atomic
sed -i "s|REQUEST_ID_PLACEHOLDER|${REQUEST_ID}|;s|RESPONSE_FILE_PLACEHOLDER|${RESPONSE_FILE}|;s|YOUR_GROUP_FOLDER|${NANOCLAW_GROUP_FOLDER}|;s|TIMESTAMP_PLACEHOLDER|$(date -u +%Y-%m-%dT%H:%M:%S.%3NZ)|" "/workspace/ipc/tasks/${REQUEST_ID}.json.tmp"
mv "/workspace/ipc/tasks/${REQUEST_ID}.json.tmp" "/workspace/ipc/tasks/${REQUEST_ID}.json"

echo "Request submitted: ${REQUEST_ID}"
echo "Polling for response at: ${RESPONSE_FILE}"
```

Then poll for the response (may take several minutes):

```bash
# Poll every 5 seconds for up to 6 minutes
for i in $(seq 1 72); do
  if [ -f "${RESPONSE_FILE}" ]; then
    cat "${RESPONSE_FILE}"
    rm -f "${RESPONSE_FILE}"
    break
  fi
  sleep 5
done
```

## Parameters

- **`prompt`** (required): What to change. Be specific — name files, describe the change, explain why.
- **`dryRun`** (default: `true`): If true, preview only (diff + build/test results). If false, merge into main.
- **`autoRestart`** (default: `false`): If true and dryRun=false, restart the NanoClaw service after merge.

## Workflow

1. **Preview first**: Submit with `"dryRun": true` (the default)
2. **Show the diff**: Tell the user what changed and why
3. **Get approval**: Wait for the user to approve
4. **Apply**: Submit again with `"dryRun": false` to merge
5. **Restart** (optional): Set `"autoRestart": true` only if the user approved it

## When to Use

- User explicitly asks for a system-level change
- Evidence from your cycle journal shows a capability gap that a code change would address
- Installing an upstream skill branch that isn't yet active locally

## When NOT to Use

- Editing group files (CLAUDE.md, cycle journals, workspace files) — use the filesystem directly
- Agent-runner changes — those require a container rebuild
- Changes to self-improvement infrastructure itself (src/self-improve.ts, IPC authorization) — always get explicit Carl approval first
- Speculative changes without user awareness

## Writing Good Prompts

The `prompt` is sent to Claude Code running on the host. Be specific:

- Name the files to change
- Describe the change clearly
- Explain why (context helps Claude Code make better decisions)
- Mention relevant patterns to follow

## Safety

- All changes run through `npm run build && npm test` — if either fails, the change is rejected
- Changes are isolated in a git worktree until explicitly merged
- Only one self-improvement run can happen at a time
- Everything is tracked on `self-improve/*` branches in git history
