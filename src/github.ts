import axios from 'axios';
import type { ActivityEntry, DateRange, GitHubEvent } from './types.js';

const BASE_URL = 'https://api.github.com';
const MAX_PAGES = 5; // GitHub returns up to 300 events (60 per page × 5 pages)

function createClient(token: string) {
  return axios.create({
    baseURL: BASE_URL,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
}

async function fetchAllEvents(
  token: string,
  username: string,
  rangeStart: Date,
): Promise<GitHubEvent[]> {
  const client = createClient(token);
  const events: GitHubEvent[] = [];

  for (let page = 1; page <= MAX_PAGES; page++) {
    const res = await client.get<GitHubEvent[]>(`/users/${username}/events`, {
      params: { per_page: 60, page },
    });
    if (res.data.length === 0) break;
    events.push(...res.data);

    // GitHub returns events in reverse-chronological order; once the oldest
    // event on this page predates the range start, subsequent pages will too.
    const oldest = res.data[res.data.length - 1];
    if (new Date(oldest.created_at) < rangeStart) break;
  }

  return events;
}

function summarizeEvent(event: GitHubEvent): string | null {
  const payload = event.payload;

  switch (event.type) {
    case 'PushEvent': {
      const commits = (payload.commits as Array<{ message: string }> | undefined) ?? [];
      if (commits.length === 0) return 'Pushed (no commits)';
      const firstMsg = commits[0].message.split('\n')[0];
      const more = commits.length > 1 ? ` (+${commits.length - 1} more)` : '';
      return `Push: ${firstMsg}${more}`;
    }

    case 'PullRequestEvent': {
      const action = payload.action as string;
      const pr = payload.pull_request as { title: string } | undefined;
      return `PR ${action}: ${pr?.title ?? '(no title)'}`;
    }

    case 'PullRequestReviewEvent': {
      const action = payload.action as string;
      const pr = payload.pull_request as { title: string } | undefined;
      return `PR Review ${action}: ${pr?.title ?? '(no title)'}`;
    }

    case 'PullRequestReviewCommentEvent': {
      const comment = payload.comment as { body: string } | undefined;
      const body = comment?.body ?? '';
      return `PR Review Comment: ${body.slice(0, 80)}${body.length > 80 ? '…' : ''}`;
    }

    case 'IssuesEvent': {
      const action = payload.action as string;
      const issue = payload.issue as { title: string } | undefined;
      return `Issue ${action}: ${issue?.title ?? '(no title)'}`;
    }

    case 'IssueCommentEvent': {
      const comment = payload.comment as { body: string } | undefined;
      const issue = payload.issue as { title: string } | undefined;
      const body = comment?.body ?? '';
      const snippet = body.slice(0, 80) + (body.length > 80 ? '…' : '');
      return `Comment on "${issue?.title ?? '?'}": ${snippet}`;
    }

    case 'CreateEvent': {
      const refType = payload.ref_type as string;
      const ref = payload.ref as string | null;
      return ref ? `Created ${refType}: ${ref}` : `Created ${refType}`;
    }

    case 'DeleteEvent': {
      const refType = payload.ref_type as string;
      const ref = payload.ref as string;
      return `Deleted ${refType}: ${ref}`;
    }

    case 'ForkEvent': {
      const forkee = payload.forkee as { full_name: string } | undefined;
      return `Forked → ${forkee?.full_name ?? '?'}`;
    }

    case 'ReleaseEvent': {
      const release = payload.release as { tag_name: string; name: string } | undefined;
      return `Release: ${release?.name ?? release?.tag_name ?? '?'}`;
    }

    case 'WatchEvent':
      return `Starred repository`;

    default:
      return null; // skip unknown / noisy events
  }
}

export async function fetchGitHubActivities(
  token: string,
  username: string,
  range: DateRange,
): Promise<ActivityEntry[]> {
  console.log(`  [GitHub] Fetching events for @${username}…`);

  const allEvents = await fetchAllEvents(token, username, range.start);

  const inRange = allEvents.filter((e) => {
    const ts = new Date(e.created_at);
    return ts >= range.start && ts < range.end;
  });

  console.log(`  [GitHub] ${inRange.length} event(s) in range (out of ${allEvents.length} total)`);

  const entries: ActivityEntry[] = [];

  for (const event of inRange) {
    const summary = summarizeEvent(event);
    if (summary === null) continue;

    entries.push({
      source: 'github',
      timestamp: new Date(event.created_at),
      roomOrRepo: event.repo.name,
      eventType: event.type,
      summary,
    });
  }

  return entries;
}
