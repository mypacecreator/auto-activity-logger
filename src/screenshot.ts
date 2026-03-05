import fs from 'fs';
import os from 'os';
import path from 'path';
import type { ActivityEntry, DateRange, ScreenshotEntry } from './types.js';

// CleanShot X filename pattern: "CleanShot 2026-03-05 at 23.30.00@2x.png"
// Also handles without @2x: "CleanShot 2026-03-05 at 23.30.00.png"
const FILENAME_PATTERN =
  /^CleanShot (\d{4})-(\d{2})-(\d{2}) at (\d{2})\.(\d{2})\.(\d{2})/;

const MATCH_WINDOW_MS = 5 * 60 * 1000; // ±5 minutes

function expandHome(dirPath: string): string {
  if (dirPath.startsWith('~/') || dirPath === '~') {
    return dirPath.replace('~', os.homedir());
  }
  return dirPath;
}

function parseFilenameTimestamp(filename: string): Date | null {
  const m = FILENAME_PATTERN.exec(filename);
  if (!m) return null;
  const [, year, month, day, hour, min, sec] = m;
  return new Date(
    parseInt(year, 10),
    parseInt(month, 10) - 1,
    parseInt(day, 10),
    parseInt(hour, 10),
    parseInt(min, 10),
    parseInt(sec, 10),
  );
}

function findNearestActivity(
  screenshotTime: Date,
  activities: ActivityEntry[],
): ActivityEntry | undefined {
  let nearest: ActivityEntry | undefined;
  let minDiff = Infinity;

  for (const entry of activities) {
    const diff = Math.abs(entry.timestamp.getTime() - screenshotTime.getTime());
    if (diff <= MATCH_WINDOW_MS && diff < minDiff) {
      minDiff = diff;
      nearest = entry;
    }
  }

  return nearest;
}

function inferContext(matched: ActivityEntry): string {
  if (matched.source === 'chatwork') {
    return '指示出しまたはメッセージの参照資料';
  }
  return '実装中の不具合または参照の備忘録';
}

export function scanScreenshots(
  screenshotDir: string,
  range: DateRange,
  activities: ActivityEntry[],
): ScreenshotEntry[] {
  const resolvedDir = expandHome(screenshotDir);

  if (!fs.existsSync(resolvedDir)) {
    console.log(`  [Screenshot] Directory not found: ${resolvedDir} — skipping`);
    return [];
  }

  const files = fs.readdirSync(resolvedDir);
  const imageFiles = files.filter((f) => /\.(png|jpg|jpeg)$/i.test(f));

  const entries: ScreenshotEntry[] = [];

  for (const filename of imageFiles) {
    const ts = parseFilenameTimestamp(filename);
    if (!ts) continue;

    // Only include screenshots from the target date range
    if (ts < range.start || ts >= range.end) continue;

    const matched = findNearestActivity(ts, activities);
    const entry: ScreenshotEntry = { filename, timestamp: ts };

    if (matched) {
      entry.matchedActivity = matched;
      entry.inference = inferContext(matched);
    }

    entries.push(entry);
  }

  // Sort chronologically
  entries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  console.log(
    `  [Screenshot] ${imageFiles.length} image(s) scanned → ${entries.length} on ${range.label}`,
  );

  return entries;
}
