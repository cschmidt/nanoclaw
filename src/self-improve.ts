import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

import { DATA_DIR } from './config.js';
import { logger } from './logger.js';

const LOCK_FILE = path.join(DATA_DIR, 'self-improve.lock');
const WORKTREE_PREFIX = '/tmp/nanoclaw-improve-';
const DEFAULT_TIMEOUT = 5 * 60 * 1000; // 5 minutes

export interface SelfImproveRequest {
  requestId: string;
  prompt: string;
  dryRun: boolean;
  autoRestart: boolean;
  responseFile: string;
}

export interface SelfImproveResult {
  status: 'success' | 'error';
  branch?: string;
  diff?: string;
  filesChanged?: string[];
  buildOutput?: string;
  testOutput?: string;
  error?: string;
  applied?: boolean;
}

function acquireLock(requestId: string): boolean {
  try {
    // Check for stale lock (> 10 minutes old)
    if (fs.existsSync(LOCK_FILE)) {
      const stat = fs.statSync(LOCK_FILE);
      const ageMs = Date.now() - stat.mtimeMs;
      if (ageMs > 10 * 60 * 1000) {
        logger.warn('Removing stale self-improve lock');
        fs.unlinkSync(LOCK_FILE);
      } else {
        return false;
      }
    }
    fs.writeFileSync(LOCK_FILE, JSON.stringify({ requestId, pid: process.pid, startedAt: new Date().toISOString() }));
    return true;
  } catch {
    return false;
  }
}

function releaseLock(): void {
  try {
    fs.unlinkSync(LOCK_FILE);
  } catch {
    /* already gone */
  }
}

function runCommand(
  cmd: string,
  args: string[],
  options: { cwd?: string; timeout?: number; input?: string },
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, {
      cwd: options.cwd,
      timeout: options.timeout || DEFAULT_TIMEOUT,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (data: Buffer) => {
      stdout += data.toString();
    });
    proc.stderr.on('data', (data: Buffer) => {
      stderr += data.toString();
    });

    if (options.input) {
      proc.stdin.write(options.input);
      proc.stdin.end();
    }

    proc.on('close', (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });

    proc.on('error', (err) => {
      resolve({ code: 1, stdout, stderr: stderr + '\n' + err.message });
    });
  });
}

async function buildSkillContext(projectRoot: string): Promise<string> {
  const sections: string[] = [];

  // Read project CLAUDE.md
  const claudeMdPath = path.join(projectRoot, 'CLAUDE.md');
  if (fs.existsSync(claudeMdPath)) {
    sections.push('# Project Context\n' + fs.readFileSync(claudeMdPath, 'utf-8'));
  }

  // Layer 1: List installed skills
  const containerSkillsDir = path.join(projectRoot, 'container', 'skills');
  const hostSkillsDir = path.join(projectRoot, '.claude', 'skills');

  const listSkills = (dir: string, label: string): string => {
    if (!fs.existsSync(dir)) return '';
    const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'));
    if (files.length === 0) return '';
    return `\n## ${label}\n${files.map((f) => `- ${f}`).join('\n')}`;
  };

  const containerSkills = listSkills(containerSkillsDir, 'Installed Container Skills');
  const hostSkills = listSkills(hostSkillsDir, 'Installed Host Skills');
  if (containerSkills || hostSkills) {
    sections.push('# Skill Inventory' + containerSkills + hostSkills);
  }

  // Layer 2: Upstream branches
  const { stdout: branchOutput } = await runCommand(
    'git',
    ['ls-remote', '--heads', 'origin'],
    { cwd: projectRoot, timeout: 15000 },
  );
  if (branchOutput.trim()) {
    const branches = branchOutput
      .trim()
      .split('\n')
      .map((line) => line.replace(/.*refs\/heads\//, ''))
      .filter((b) => b !== 'main');
    if (branches.length > 0) {
      sections.push('# Upstream Branches\n' + branches.map((b) => `- ${b}`).join('\n'));
    }
  }

  sections.push(
    '# Instructions\n' +
    'Prefer reusing existing skills and upstream branches over reimplementing functionality. ' +
    'Make the minimum change needed. Run npm run build && npm test to validate.',
  );

  return sections.join('\n\n');
}

export async function handleSelfImprove(
  request: SelfImproveRequest,
  sourceGroup: string,
): Promise<SelfImproveResult> {
  const projectRoot = process.cwd();
  const branchName = `self-improve/${Date.now()}-${request.requestId.slice(0, 8)}`;
  const worktreePath = `${WORKTREE_PREFIX}${request.requestId}`;

  if (!acquireLock(request.requestId)) {
    return {
      status: 'error',
      error: 'Another self-improvement run is in progress. Try again later.',
    };
  }

  try {
    logger.info(
      { requestId: request.requestId, sourceGroup, dryRun: request.dryRun },
      'Starting self-improvement run',
    );

    // Create branch and worktree
    const { code: worktreeCode, stderr: worktreeErr } = await runCommand(
      'git',
      ['worktree', 'add', '-b', branchName, worktreePath],
      { cwd: projectRoot },
    );
    if (worktreeCode !== 0) {
      return { status: 'error', error: `Failed to create worktree: ${worktreeErr}` };
    }

    try {
      // Install dependencies in worktree
      const { code: installCode, stderr: installErr } = await runCommand(
        'npm',
        ['ci'],
        { cwd: worktreePath, timeout: 120000 },
      );
      if (installCode !== 0) {
        return { status: 'error', error: `npm install failed: ${installErr}` };
      }

      // Build sub-Claude context
      const systemContext = await buildSkillContext(projectRoot);

      // Spawn claude in print mode with permissions bypass for file editing
      const fullPrompt = systemContext
        ? `<context>\n${systemContext}\n</context>\n\n${request.prompt}`
        : request.prompt;
      const { code: claudeCode, stdout: claudeOutput, stderr: claudeErr } = await runCommand(
        'claude',
        ['-p', '--output-format', 'text', '--dangerously-skip-permissions'],
        {
          cwd: worktreePath,
          timeout: DEFAULT_TIMEOUT,
          input: fullPrompt,
        },
      );

      if (claudeCode !== 0) {
        return {
          status: 'error',
          error: `Claude CLI failed (exit ${claudeCode}): ${claudeErr.slice(0, 2000)}`,
        };
      }

      // Check if any files changed
      const { stdout: statusOutput } = await runCommand(
        'git',
        ['status', '--porcelain'],
        { cwd: worktreePath },
      );

      if (!statusOutput.trim()) {
        return {
          status: 'error',
          error: 'Claude made no file changes. Output:\n' + claudeOutput.slice(0, 2000),
        };
      }

      // Stage all changes
      await runCommand('git', ['add', '-A'], { cwd: worktreePath });

      // Run build
      const { code: buildCode, stdout: buildOut, stderr: buildErr } = await runCommand(
        'npm',
        ['run', 'build'],
        { cwd: worktreePath, timeout: 60000 },
      );

      const buildOutput = (buildOut + '\n' + buildErr).trim();

      if (buildCode !== 0) {
        return {
          status: 'error',
          error: 'Build failed',
          buildOutput: buildOutput.slice(0, 3000),
        };
      }

      // Run tests
      const { code: testCode, stdout: testOut, stderr: testErr } = await runCommand(
        'npm',
        ['test'],
        { cwd: worktreePath, timeout: 120000 },
      );

      const testOutput = (testOut + '\n' + testErr).trim();

      if (testCode !== 0) {
        return {
          status: 'error',
          error: 'Tests failed',
          buildOutput: buildOutput.slice(0, 1500),
          testOutput: testOutput.slice(0, 3000),
        };
      }

      // Commit changes
      await runCommand(
        'git',
        ['commit', '-m', `self-improve: ${request.prompt.slice(0, 72)}\n\nRequested by: ${sourceGroup}\nRequest ID: ${request.requestId}`],
        { cwd: worktreePath },
      );

      // Get diff
      const { stdout: diffOutput } = await runCommand(
        'git',
        ['diff', 'main...HEAD', '--stat'],
        { cwd: worktreePath },
      );

      const { stdout: fullDiff } = await runCommand(
        'git',
        ['diff', 'main...HEAD'],
        { cwd: worktreePath },
      );

      // Get files changed
      const { stdout: filesOutput } = await runCommand(
        'git',
        ['diff', 'main...HEAD', '--name-only'],
        { cwd: worktreePath },
      );
      const filesChanged = filesOutput.trim().split('\n').filter(Boolean);

      const result: SelfImproveResult = {
        status: 'success',
        branch: branchName,
        diff: fullDiff.slice(0, 10000),
        filesChanged,
        buildOutput: buildOutput.slice(0, 1500),
        testOutput: testOutput.slice(0, 1500),
        applied: false,
      };

      // If not dry run, apply the change
      if (!request.dryRun) {
        const applyResult = await applyImprovement(branchName, projectRoot, request.autoRestart);
        result.applied = applyResult.applied;
        if (applyResult.error) {
          result.error = applyResult.error;
          result.status = 'error';
        }
      }

      return result;
    } finally {
      // Clean up worktree
      await runCommand('git', ['worktree', 'remove', '--force', worktreePath], {
        cwd: projectRoot,
      });
      // If dry run, keep the branch for later apply; otherwise clean up
      if (request.dryRun) {
        logger.info({ branchName }, 'Worktree cleaned up, branch preserved for review');
      } else {
        // Branch merged or failed — clean up
        await runCommand('git', ['branch', '-D', branchName], { cwd: projectRoot });
      }
    }
  } finally {
    releaseLock();
  }
}

async function applyImprovement(
  branchName: string,
  projectRoot: string,
  autoRestart: boolean,
): Promise<{ applied: boolean; error?: string }> {
  // Merge branch into current branch
  const { code: mergeCode, stderr: mergeErr } = await runCommand(
    'git',
    ['merge', branchName, '--no-ff', '-m', `Merge ${branchName}`],
    { cwd: projectRoot },
  );

  if (mergeCode !== 0) {
    // Abort merge if it failed
    await runCommand('git', ['merge', '--abort'], { cwd: projectRoot });
    return { applied: false, error: `Merge failed: ${mergeErr}` };
  }

  // Build in live repo
  const { code: buildCode, stderr: buildErr } = await runCommand(
    'npm',
    ['run', 'build'],
    { cwd: projectRoot, timeout: 60000 },
  );

  if (buildCode !== 0) {
    // Revert the merge
    await runCommand('git', ['revert', '--no-edit', 'HEAD'], { cwd: projectRoot });
    return { applied: false, error: `Post-merge build failed, reverted: ${buildErr}` };
  }

  // Clean up the branch after successful merge
  await runCommand('git', ['branch', '-d', branchName], { cwd: projectRoot });

  if (autoRestart) {
    logger.info('Auto-restarting NanoClaw service');
    const { code: restartCode, stderr: restartErr } = await runCommand(
      'systemctl',
      ['--user', 'restart', 'nanoclaw'],
      { cwd: projectRoot, timeout: 10000 },
    );
    if (restartCode !== 0) {
      logger.error({ stderr: restartErr }, 'Service restart failed');
    }
  }

  return { applied: true };
}

export { buildSkillContext as _buildSkillContext, runCommand as _runCommand };
