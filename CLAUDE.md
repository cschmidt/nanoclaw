# NanoClaw

Personal Claude assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Quick Context

Single Node.js process with skill-based channel system. Channels (WhatsApp, Telegram, Slack, Discord, Gmail) are skills that self-register at startup. Messages route to Claude Agent SDK running in containers (Linux VMs). Each group has isolated filesystem and memory.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/registry.ts` | Channel registry (self-registration at startup) |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/router.ts` | Message formatting and outbound routing |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/db.ts` | SQLite operations |
| `groups/{name}/CLAUDE.md` | Per-group memory (isolated) |
| `container/skills/agent-browser.md` | Browser automation tool (available to all agents via Bash) |

## Skills

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |
| `/update-nanoclaw` | Bring upstream NanoClaw updates into a customized install |
| `/qodo-pr-resolver` | Fetch and fix Qodo PR review issues interactively or in batch |
| `/get-qodo-rules` | Load org- and repo-level coding rules from Qodo before code tasks |

## Engineering Standards

These apply to all code changes, including self-improvement runs.

### Before writing code
- Read the files you're touching. Understand existing patterns before introducing new ones.
- Check for tests: `find . -name "*.test.ts" | head -20`. If touched code has tests, your change needs coverage too.
- Run `/get-qodo-rules` for non-trivial changes to load repo coding rules.

### TypeScript
- No `any` types without an explanatory comment.
- Prefer explicit types over inference for function signatures.
- Follow the import ordering and style in adjacent files.

### Making changes
- Surgical edits — change what's needed, leave surrounding code alone unless it's directly in the way.
- Follow patterns already established in the file you're editing. Don't introduce a new abstraction when the existing pattern handles it.
- If you notice something clearly broken or wrong in code you're touching, fix it — but keep it separate from the main change so the diff stays readable.

### Validation
- Run `npm run build` before considering a change done. TypeScript errors are failures.
- If touching `container/Dockerfile` or `container/build.sh`, note that the container image will need a rebuild: `./container/build.sh`.

### Self-improvement changes specifically
- Prefer the smallest diff that solves the problem. This is not the place for opportunistic refactoring.
- Group config files under `groups/` are gitignored — changes there require manual copy by Carl. Document this if your change affects them.
- When adding host mounts in `container-runner.ts`, use `os.homedir()` not `process.env.HOME`.

## Development

Run commands directly—don't tell the user to run them.

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container
```

Service management:
```bash
# macOS (launchd)
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl kickstart -k gui/$(id -u)/com.nanoclaw  # restart

# Linux (systemd)
systemctl --user start nanoclaw
systemctl --user stop nanoclaw
systemctl --user restart nanoclaw
```

## Troubleshooting

**WhatsApp not connecting after upgrade:** WhatsApp is now a separate channel fork, not bundled in core. Run `/add-whatsapp` (or `git remote add whatsapp https://github.com/qwibitai/nanoclaw-whatsapp.git && git fetch whatsapp main && (git merge whatsapp/main || { git checkout --theirs package-lock.json && git add package-lock.json && git merge --continue; }) && npm run build`) to install it. Existing auth credentials and groups are preserved.

## Container Build Cache

The container buildkit caches the build context aggressively. `--no-cache` alone does NOT invalidate COPY steps — the builder's volume retains stale files. To force a truly clean rebuild, prune the builder then re-run `./container/build.sh`.
