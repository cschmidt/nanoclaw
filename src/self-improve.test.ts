import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ChildProcess } from 'child_process';

// Mock child_process before importing the module under test
vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

import { spawn } from 'child_process';
import { handleSelfImprove, SelfImproveRequest } from './self-improve.js';
import fs from 'fs';
import path from 'path';

const mockSpawn = vi.mocked(spawn);

interface MockSpec {
  code: number;
  stdout?: string;
  stderr?: string;
}

/**
 * Set up spawn mock to return processes that emit events after listeners attach.
 * Uses mockImplementation so each spawn() call creates a fresh process.
 */
function setupSpawnMocks(specs: MockSpec[]): void {
  let callIndex = 0;
  mockSpawn.mockImplementation(() => {
    const spec = specs[callIndex++] || {
      code: 1,
      stderr: 'No mock configured',
    };
    const { EventEmitter } = require('stream');
    const proc = new EventEmitter() as ChildProcess;

    // Create minimal streams
    const stdoutEmitter = new EventEmitter();
    const stderrEmitter = new EventEmitter();
    (proc as any).stdout = stdoutEmitter;
    (proc as any).stderr = stderrEmitter;
    (proc as any).stdin = {
      write: vi.fn(),
      end: vi.fn(),
    };
    (proc as any).pid = 10000 + callIndex;

    // Defer event emission so callers can attach listeners first
    setImmediate(() => {
      if (spec.stdout) stdoutEmitter.emit('data', Buffer.from(spec.stdout));
      if (spec.stderr) stderrEmitter.emit('data', Buffer.from(spec.stderr));
      proc.emit('close', spec.code);
    });

    return proc;
  });
}

describe('handleSelfImprove', () => {
  const lockFile = path.join(process.cwd(), 'data', 'self-improve.lock');

  beforeEach(() => {
    mockSpawn.mockReset();
    try {
      fs.unlinkSync(lockFile);
    } catch {
      /* doesn't exist */
    }
  });

  afterEach(() => {
    try {
      fs.unlinkSync(lockFile);
    } catch {
      /* doesn't exist */
    }
  });

  it('returns error when lock is held', async () => {
    fs.mkdirSync(path.dirname(lockFile), { recursive: true });
    fs.writeFileSync(
      lockFile,
      JSON.stringify({
        requestId: 'other',
        pid: 9999,
        startedAt: new Date().toISOString(),
      }),
    );

    const request: SelfImproveRequest = {
      requestId: 'test-123',
      prompt: 'add a comment',
      dryRun: true,
      autoRestart: false,
      responseFile: '',
    };

    const result = await handleSelfImprove(request, 'test-group');
    expect(result.status).toBe('error');
    expect(result.error).toContain(
      'Another self-improvement run is in progress',
    );
  });

  it('returns error when worktree creation fails', async () => {
    setupSpawnMocks([{ code: 1, stderr: 'fatal: cannot create worktree' }]);

    const request: SelfImproveRequest = {
      requestId: 'test-456',
      prompt: 'add a comment',
      dryRun: true,
      autoRestart: false,
      responseFile: '',
    };

    const result = await handleSelfImprove(request, 'test-group');
    expect(result.status).toBe('error');
    expect(result.error).toContain('Failed to create worktree');
  });

  it('returns error when claude makes no changes', async () => {
    setupSpawnMocks([
      { code: 0 }, // git worktree add
      { code: 0 }, // npm ci
      { code: 0, stdout: '' }, // git ls-remote
      { code: 0, stdout: 'No changes needed' }, // claude --print
      { code: 0, stdout: '' }, // git status --porcelain (empty)
      { code: 0 }, // git worktree remove (cleanup)
    ]);

    const request: SelfImproveRequest = {
      requestId: 'test-789',
      prompt: 'do nothing',
      dryRun: true,
      autoRestart: false,
      responseFile: '',
    };

    const result = await handleSelfImprove(request, 'test-group');
    expect(result.status).toBe('error');
    expect(result.error).toContain('no file changes');
  });

  it('returns error when build fails', async () => {
    setupSpawnMocks([
      { code: 0 }, // git worktree add
      { code: 0 }, // npm ci
      { code: 0, stdout: '' }, // git ls-remote
      { code: 0, stdout: 'Changes made' }, // claude --print
      { code: 0, stdout: 'M src/config.ts' }, // git status --porcelain
      { code: 0 }, // git add -A
      { code: 1, stderr: 'tsc error' }, // npm run build (FAILS)
      { code: 0 }, // git worktree remove (cleanup)
    ]);

    const request: SelfImproveRequest = {
      requestId: 'test-build',
      prompt: 'break the build',
      dryRun: true,
      autoRestart: false,
      responseFile: '',
    };

    const result = await handleSelfImprove(request, 'test-group');
    expect(result.status).toBe('error');
    expect(result.error).toBe('Build failed');
    expect(result.buildOutput).toContain('tsc error');
  });

  it('returns error when tests fail', async () => {
    setupSpawnMocks([
      { code: 0 }, // git worktree add
      { code: 0 }, // npm ci
      { code: 0, stdout: '' }, // git ls-remote
      { code: 0, stdout: 'Changes made' }, // claude --print
      { code: 0, stdout: 'M src/config.ts' }, // git status --porcelain
      { code: 0 }, // git add -A
      { code: 0, stdout: 'Build ok' }, // npm run build
      { code: 1, stderr: 'FAIL test.ts' }, // npm test (FAILS)
      { code: 0 }, // git worktree remove (cleanup)
    ]);

    const request: SelfImproveRequest = {
      requestId: 'test-tests',
      prompt: 'break the tests',
      dryRun: true,
      autoRestart: false,
      responseFile: '',
    };

    const result = await handleSelfImprove(request, 'test-group');
    expect(result.status).toBe('error');
    expect(result.error).toBe('Tests failed');
    expect(result.testOutput).toContain('FAIL');
  });

  it('succeeds with dry_run=true and preserves branch', async () => {
    setupSpawnMocks([
      { code: 0 }, // git worktree add
      { code: 0 }, // npm ci
      { code: 0, stdout: '' }, // git ls-remote
      { code: 0, stdout: 'Added comment' }, // claude --print
      { code: 0, stdout: 'M src/config.ts' }, // git status --porcelain
      { code: 0 }, // git add -A
      { code: 0, stdout: 'Build ok' }, // npm run build
      { code: 0, stdout: 'Tests pass' }, // npm test
      { code: 0 }, // git commit
      { code: 0, stdout: ' src/config.ts | 1 +\n 1 file changed' }, // git diff --stat
      { code: 0, stdout: '+// comment added' }, // git diff (full)
      { code: 0, stdout: 'src/config.ts' }, // git diff --name-only
      { code: 0 }, // git worktree remove
    ]);

    const request: SelfImproveRequest = {
      requestId: 'test-dry',
      prompt: 'add a comment to config',
      dryRun: true,
      autoRestart: false,
      responseFile: '',
    };

    const result = await handleSelfImprove(request, 'test-group');
    expect(result.status).toBe('success');
    expect(result.branch).toContain('self-improve/');
    expect(result.filesChanged).toContain('src/config.ts');
    expect(result.diff).toContain('+// comment added');
    expect(result.applied).toBe(false);
  });

  it('releases lock after failure', async () => {
    setupSpawnMocks([
      { code: 1, stderr: 'fatal error' }, // git worktree add (fails)
    ]);

    const request: SelfImproveRequest = {
      requestId: 'test-lock',
      prompt: 'fail',
      dryRun: true,
      autoRestart: false,
      responseFile: '',
    };

    await handleSelfImprove(request, 'test-group');
    expect(fs.existsSync(lockFile)).toBe(false);
  });
});
