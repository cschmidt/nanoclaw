#!/usr/bin/env tsx
/**
 * Set trusted_targets for a registered group.
 *
 * Usage: tsx scripts/set-trusted-targets.ts <source_folder> <target_jid1> [target_jid2...]
 *
 * Example:
 *   tsx scripts/set-trusted-targets.ts scout tg:-5260929784
 */
import Database from 'better-sqlite3';
import os from 'os';
import path from 'path';

const args = process.argv.slice(2);
if (args.length < 2) {
  console.error(
    'Usage: tsx scripts/set-trusted-targets.ts <source_folder> <target_jid1> [target_jid2...]',
  );
  process.exit(1);
}

const sourceFolder = args[0];
const targetJids = args.slice(1);

const dbPath = path.join(os.homedir(), 'projects', 'nanoclaw', 'store', 'messages.db');
const db = new Database(dbPath);

// Find the source group by folder
const sourceRow = db
  .prepare('SELECT jid, name, folder FROM registered_groups WHERE folder = ?')
  .get(sourceFolder) as { jid: string; name: string; folder: string } | undefined;

if (!sourceRow) {
  console.error(`Error: No registered group with folder "${sourceFolder}"`);
  const allFolders = db
    .prepare('SELECT folder, name FROM registered_groups')
    .all() as Array<{ folder: string; name: string }>;
  if (allFolders.length > 0) {
    console.error('\nAvailable groups:');
    for (const g of allFolders) {
      console.error(`  ${g.folder} (${g.name})`);
    }
  }
  process.exit(1);
}

// Warn about target JIDs that aren't registered
const allGroups = db
  .prepare('SELECT jid, name, folder FROM registered_groups')
  .all() as Array<{ jid: string; name: string; folder: string }>;
const jidToName = new Map(allGroups.map((g) => [g.jid, g.name]));

for (const jid of targetJids) {
  if (!jidToName.has(jid)) {
    console.warn(`Warning: target JID "${jid}" is not a registered group`);
  }
}

// Update trusted_targets
db.prepare('UPDATE registered_groups SET trusted_targets = ? WHERE folder = ?').run(
  JSON.stringify(targetJids),
  sourceFolder,
);

console.log(`\nUpdated trusted_targets for "${sourceRow.name}" (${sourceRow.folder}):`);
for (const jid of targetJids) {
  const name = jidToName.get(jid);
  console.log(`  → ${jid}${name ? ` (${name})` : ' (unregistered)'}`);
}

db.close();
