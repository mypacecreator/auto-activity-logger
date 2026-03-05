import 'dotenv/config';
import { program } from 'commander';
import { fetchChatworkActivities } from './chatwork.js';
import { fetchGitHubActivities } from './github.js';
import { buildMarkdown, saveMarkdown } from './formatter.js';
import type { DateRange, DateTarget } from './types.js';

// ---------------------------------------------------------------------------
// Config validation
// ---------------------------------------------------------------------------

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) {
    console.error(`[ERROR] Missing required environment variable: ${key}`);
    console.error(`        Copy .env.example to .env and fill in your values.`);
    process.exit(1);
  }
  return val;
}

// ---------------------------------------------------------------------------
// Date range helpers
// ---------------------------------------------------------------------------

function buildDateRange(target: DateTarget): DateRange {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  let start: Date;
  let end: Date;

  if (target === 'today') {
    start = today;
    end = new Date(today.getTime() + 24 * 60 * 60 * 1000);
  } else {
    start = new Date(today.getTime() - 24 * 60 * 60 * 1000);
    end = today;
  }

  const label = start.toISOString().slice(0, 10); // "YYYY-MM-DD"
  return { start, end, label };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  program
    .name('auto-activity-logger')
    .description('Extract your activity logs from Chatwork and GitHub into Markdown')
    .option(
      '--date <target>',
      'Date to collect: "today" or "yesterday"',
      process.env.DEFAULT_DATE ?? 'yesterday',
    )
    .option('--no-chatwork', 'Skip Chatwork (useful when token is not yet configured)')
    .option('--no-github', 'Skip GitHub (useful when token is not yet configured)')
    .parse();

  const opts = program.opts<{
    date: string;
    chatwork: boolean;
    github: boolean;
  }>();

  if (opts.date !== 'today' && opts.date !== 'yesterday') {
    console.error(`[ERROR] --date must be "today" or "yesterday", got: "${opts.date}"`);
    process.exit(1);
  }

  const range = buildDateRange(opts.date as DateTarget);
  const outputDir = process.env.OUTPUT_DIR ?? 'logs';

  console.log(`\nauto-activity-logger`);
  console.log(`${'─'.repeat(40)}`);
  console.log(`Date   : ${range.label} (${range.start.toISOString()} – ${range.end.toISOString()})`);
  console.log(`Output : ${outputDir}/${range.label}_activity.md`);
  console.log(`${'─'.repeat(40)}\n`);

  const allEntries: Awaited<ReturnType<typeof fetchChatworkActivities>> = [];

  // -------------------------------------------------------------------------
  // Chatwork
  // -------------------------------------------------------------------------
  if (opts.chatwork) {
    const cwToken = requireEnv('CHATWORK_API_TOKEN');
    const cwAccountId = parseInt(requireEnv('CHATWORK_MY_ACCOUNT_ID'), 10);

    const roomIdEnv = process.env.CHATWORK_ROOM_IDS ?? '';
    const roomIds = roomIdEnv
      ? roomIdEnv
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !isNaN(n))
      : null;

    if (roomIds === null) {
      console.log('  [Chatwork] No CHATWORK_ROOM_IDS set → fetching all rooms');
    } else {
      console.log(`  [Chatwork] Using ${roomIds.length} configured room(s)`);
    }

    const cwEntries = await fetchChatworkActivities(cwToken, cwAccountId, roomIds, range);
    allEntries.push(...cwEntries);
    console.log(`  [Chatwork] Done. ${cwEntries.length} activity entry(ies) collected.\n`);
  } else {
    console.log('  [Chatwork] Skipped (--no-chatwork)\n');
  }

  // -------------------------------------------------------------------------
  // GitHub
  // -------------------------------------------------------------------------
  if (opts.github) {
    const ghToken = requireEnv('GITHUB_TOKEN');
    const ghUsername = requireEnv('GITHUB_USERNAME');

    const ghEntries = await fetchGitHubActivities(ghToken, ghUsername, range);
    allEntries.push(...ghEntries);
    console.log(`  [GitHub] Done. ${ghEntries.length} activity entry(ies) collected.\n`);
  } else {
    console.log('  [GitHub] Skipped (--no-github)\n');
  }

  // -------------------------------------------------------------------------
  // Output
  // -------------------------------------------------------------------------
  const markdown = buildMarkdown(allEntries, range);
  const savedPath = saveMarkdown(markdown, outputDir, range.label);

  console.log(`${'─'.repeat(40)}`);
  console.log(`✓ Saved: ${savedPath}`);
  console.log(`  Total activities: ${allEntries.length}`);
  console.log(`${'─'.repeat(40)}\n`);
}

main().catch((err) => {
  console.error('\n[FATAL]', err instanceof Error ? err.message : err);
  process.exit(1);
});
