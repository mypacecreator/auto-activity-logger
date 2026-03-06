import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import type { ActivityEntry, DateRange } from './types.js';

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

function createGmailClient(keyFilePath: string, impersonateEmail: string) {
  const resolvedPath = path.resolve(keyFilePath);
  if (!fs.existsSync(resolvedPath)) {
    throw new Error(`Service account key not found: ${resolvedPath}`);
  }

  const auth = new google.auth.GoogleAuth({
    keyFile: resolvedPath,
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
    clientOptions: { subject: impersonateEmail },
  });

  return google.gmail({ version: 'v1', auth });
}

// ---------------------------------------------------------------------------
// Date query helpers
// ---------------------------------------------------------------------------

function toGmailDate(date: Date): string {
  // Gmail search uses YYYY/MM/DD
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}/${m}/${d}`;
}

// ---------------------------------------------------------------------------
// Message parsing helpers
// ---------------------------------------------------------------------------

function getHeader(
  headers: Array<{ name?: string | null; value?: string | null }>,
  name: string,
): string {
  return headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? '';
}

function parseToRecipients(toHeader: string): string {
  // "Alice <alice@example.com>, Bob <bob@example.com>" → "alice@example.com (+1)"
  const parts = toHeader.split(',').map((s) => s.trim());
  const first = parts[0].replace(/^.*<(.+)>$/, '$1').trim() || parts[0];
  if (parts.length === 1) return first;
  return `${first} (+${parts.length - 1})`;
}

function buildSummary(subject: string, snippet: string): string {
  const sub = subject ? `[${subject}] ` : '';
  const full = `${sub}${snippet}`;
  if (full.length <= 100) return full;
  return `${full.slice(0, 99)}…`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function fetchGmailActivities(
  keyFilePath: string,
  gmailAddress: string,
  range: DateRange,
): Promise<ActivityEntry[]> {
  console.log(`  [Gmail] Fetching sent messages for ${gmailAddress}…`);

  const gmail = createGmailClient(keyFilePath, gmailAddress);

  // Gmail date search is inclusive on both ends; use after/before for precision
  const query = `in:sent after:${toGmailDate(range.start)} before:${toGmailDate(range.end)}`;

  // List matching message IDs (up to 100; sent volume is typically low)
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 100,
  });

  const messages = listRes.data.messages ?? [];
  console.log(`  [Gmail] ${messages.length} sent message(s) found`);

  const entries: ActivityEntry[] = [];

  for (const msg of messages) {
    if (!msg.id) continue;

    const detail = await gmail.users.messages.get({
      userId: 'me',
      id: msg.id,
      format: 'metadata',
      metadataHeaders: ['Date', 'Subject', 'To', 'In-Reply-To'],
    });

    const headers = detail.data.payload?.headers ?? [];
    const dateStr = getHeader(headers, 'Date');
    const subject = getHeader(headers, 'Subject');
    const to = getHeader(headers, 'To');
    const inReplyTo = getHeader(headers, 'In-Reply-To');
    const snippet = detail.data.snippet ?? '';

    const timestamp = dateStr ? new Date(dateStr) : new Date();

    // Filter strictly by timestamp (Gmail's date query rounds to day boundaries)
    if (timestamp < range.start || timestamp >= range.end) continue;

    entries.push({
      source: 'gmail',
      timestamp,
      roomOrRepo: to ? parseToRecipients(to) : '(no recipient)',
      eventType: inReplyTo ? 'Reply' : 'New thread',
      summary: buildSummary(subject, snippet),
    });
  }

  // Sort chronologically
  entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return entries;
}
