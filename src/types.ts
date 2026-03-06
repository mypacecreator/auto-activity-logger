// =============================================================================
// Shared domain types
// =============================================================================

export type DateTarget = 'today' | 'yesterday';

export interface DateRange {
  start: Date;
  end: Date;
  label: string; // "YYYY-MM-DD" for filename
}

// -----------------------------------------------------------------------------
// Chatwork
// -----------------------------------------------------------------------------

export interface ChatworkRoom {
  room_id: number;
  name: string;
  type: 'my' | 'direct' | 'group';
  last_update_time?: number; // Unix timestamp — returned by GET /rooms
}

export interface ChatworkMessage {
  message_id: string;
  account: {
    account_id: number;
    name: string;
  };
  body: string;
  send_time: number; // Unix timestamp
  room_id: number;
  room_name: string;
}

// -----------------------------------------------------------------------------
// GitHub
// -----------------------------------------------------------------------------

export type GitHubEventType =
  | 'PushEvent'
  | 'PullRequestEvent'
  | 'IssuesEvent'
  | 'IssueCommentEvent'
  | 'CreateEvent'
  | 'DeleteEvent'
  | 'ForkEvent'
  | 'WatchEvent'
  | 'ReleaseEvent'
  | 'PullRequestReviewEvent'
  | 'PullRequestReviewCommentEvent'
  | string;

export interface GitHubEvent {
  id: string;
  type: GitHubEventType;
  repo: {
    name: string; // "owner/repo"
  };
  payload: Record<string, unknown>;
  created_at: string; // ISO 8601
}

// -----------------------------------------------------------------------------
// Unified activity entry (used by formatter)
// -----------------------------------------------------------------------------

export type ActivitySource = 'chatwork' | 'github' | 'gmail';

export interface ActivityEntry {
  source: ActivitySource;
  timestamp: Date;
  roomOrRepo: string;   // Chatwork room name or GitHub "owner/repo"
  eventType: string;    // e.g. "PushEvent", "Chatwork message"
  summary: string;      // First 100 chars or event description
}

// -----------------------------------------------------------------------------
// Screenshot
// -----------------------------------------------------------------------------

export interface ScreenshotEntry {
  filename: string;              // basename only, e.g. "CleanShot 2026-03-05 at 23.30.00@2x.png"
  timestamp: Date;               // parsed from filename
  matchedActivity?: ActivityEntry; // nearest ActivityEntry within ±5 min
  inference?: string;            // human-readable context guess
}
