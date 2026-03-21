# Self-Improvement Skill

Enable NanoClaw agents to modify the NanoClaw codebase itself via chat, using Claude Code as the execution engine on the host.

## Problem

Today, modifying NanoClaw requires running Claude Code directly on the host. The container agents can't edit the codebase — the project mount is read-only, and containers lack build tooling. This means code changes (new features, bug fixes, integrations) require a separate terminal session.

## Approach

Use the existing IPC mechanism to bridge chat → host. The agent writes a `claude_code` IPC command with a prompt. The host spawns a Claude Code process, validates the result, and restarts the service if successful.

```
User (Telegram/WhatsApp)
  → Agent (container)
    → IPC request: { action: "claude_code", prompt: "add retry logic to sendMessage" }
      → Host: spawns `claude` CLI against the codebase
        → Build + test gate
          → On success: restart service, report back
          → On failure: rollback, return error
```

## Skill Structure

```
.claude/skills/self-improve/
├── SKILL.md                              # Setup instructions
├── manifest.yaml                         # Skill metadata
├── add/
│   └── src/
│       └── claude-code-runner.ts         # Host-side Claude Code spawner
├── modify/
│   └── src/
│       ├── ipc.ts                        # Add claude_code command handler
│       ├── ipc.ts.intent.md              # Merge intent for ipc.ts
│       └── types.ts                      # Add IPC command type
└── container/
    └── skills/
        └── self-improve.md               # Agent-side instructions
```

## Components

### 1. claude-code-runner.ts (host-side)

Responsibilities:
- Receive a prompt string from IPC
- Spawn `claude` CLI as a subprocess with the NanoClaw project as working directory
- Capture output (changes made, files modified)
- Run `npm run build && npm test` to validate
- On success: commit changes, restart the service (`systemctl --user restart nanoclaw` or `launchctl kickstart`)
- On failure: `git checkout .` to rollback, return error details
- Return structured result to IPC caller

Key decisions:
- **`claude --print` vs interactive**: `--print` is simpler (single prompt → response), but can't handle multi-turn. Start with `--print` and a well-crafted system prompt that includes project context.
- **Timeout**: Claude Code can run for minutes. Need a configurable timeout (default 5 min?).
- **Concurrency**: Only one self-improvement run at a time. Use a lock file or mutex.
- **Git safety**: Create a branch before changes, commit on success, delete on failure. This gives a clean rollback path and an audit trail.

```typescript
interface ClaudeCodeRequest {
  prompt: string;
  timeout?: number;        // ms, default 300000
  autoRestart?: boolean;   // default true
  dryRun?: boolean;        // validate but don't apply
}

interface ClaudeCodeResult {
  success: boolean;
  filesChanged: string[];
  buildPassed: boolean;
  testsPassed: boolean;
  output: string;          // Claude Code's response
  error?: string;
  commitHash?: string;     // if changes were committed
}
```

### 2. IPC command handler (modify ipc.ts)

Add a `claude_code` action to the IPC command processor. Only allow from the main group (security gate — non-main agents shouldn't modify the codebase).

```typescript
case 'claude_code':
  if (!isMain) {
    return { error: 'claude_code is only available to the main group' };
  }
  return await runClaudeCode(data.prompt, data.options);
```

### 3. Container-side instructions (self-improve.md)

A skill file mounted into the container that teaches the agent:
- When to use self-improvement (user explicitly asks for code changes to NanoClaw)
- How to invoke it (write IPC request)
- What to expect back (structured result)
- When NOT to use it (routine tasks, anything that doesn't require codebase changes)

## Safety Considerations

### Must-have before v1
- **Main-group only**: Only the main agent can trigger code changes
- **Build+test gate**: Changes that break build or tests are auto-rolled back
- **Git branch isolation**: All changes on a branch, committed only on success
- **Single-run lock**: No concurrent self-improvement runs
- **Timeout**: Hard limit on Claude Code execution time

### Nice-to-have
- **Approval mode**: Agent proposes changes, user approves from chat before applying
- **Scope limits**: Restrict which files/directories Claude Code can modify
- **Audit log**: Record all self-improvement runs with prompts, changes, and outcomes
- **Rate limiting**: Prevent runaway self-modification loops

### Risks
- **Recursive self-improvement**: Agent modifies its own instructions or the self-improvement skill itself. Mitigate by excluding `.claude/skills/` and `container/` from the writable scope.
- **Service instability**: A change passes tests but causes runtime issues. Mitigate with health checks after restart — if the service crashes within N seconds, auto-rollback.
- **Security**: The Claude Code process runs with full host access. The IPC prompt is the attack surface. Mitigate by restricting to main group and logging all prompts.

## Implementation Plan

1. **Create the skill scaffold** — manifest, directory structure
2. **Implement claude-code-runner.ts** — spawn, validate, commit/rollback
3. **Modify ipc.ts** — add command handler with main-group gate
4. **Write container skill file** — agent instructions
5. **Add tests** — mock Claude Code subprocess, test build/rollback flows
6. **Apply skill** — `npx tsx scripts/apply-skill.ts .claude/skills/self-improve`
7. **Test end-to-end** — ask the main agent to make a small change from chat

## Open Questions

- Should the agent be able to trigger `/update` (upstream pulls) via this mechanism, or keep that as a separate host-side operation?
- Should there be a "suggest mode" where the agent shows a diff in chat for approval before applying?
- Should self-improvement results be stored in the group's conversation history so the agent remembers what it changed?
- Should we support MCP tool invocation as an alternative to IPC file-based communication?
