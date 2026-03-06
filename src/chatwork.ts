import axios, { type AxiosInstance } from 'axios';
import type { ActivityEntry, ChatworkMessage, ChatworkRoom, DateRange } from './types.js';

const BASE_URL = 'https://api.chatwork.com/v2';

function createClient(apiToken: string): AxiosInstance {
  return axios.create({
    baseURL: BASE_URL,
    headers: { 'X-ChatWorkToken': apiToken },
  });
}

async function fetchMyRooms(client: AxiosInstance): Promise<ChatworkRoom[]> {
  const res = await client.get<ChatworkRoom[]>('/rooms');
  return res.data;
}

async function fetchMessagesFromRoom(
  client: AxiosInstance,
  roomId: number,
): Promise<ChatworkMessage[]> {
  // force=1 to fetch all messages (not just unread)
  const res = await client.get<ChatworkMessage[]>(`/rooms/${roomId}/messages`, {
    params: { force: 1 },
  });
  return res.data;
}

function trimBody(body: string, maxLen = 100): string {
  // Strip Chatwork markup tags like [To:123], [reply aid=...]...[/reply], [info]...[/info]
  const cleaned = body
    .replace(/\[To:\d+\][^\n]*/g, '')       // mentions
    .replace(/\[reply[^\]]*\][\s\S]*?\[\/reply\]/g, '') // reply blocks
    .replace(/\[info\][\s\S]*?\[\/info\]/g, '')          // info blocks
    .replace(/\[qt\][\s\S]*?\[\/qt\]/g, '')              // quote blocks
    .replace(/\[(\w+)[^\]]*\]/g, '')                      // any other tags
    .trim();
  if (cleaned.length <= maxLen) return cleaned;
  return `${cleaned.slice(0, maxLen)}…`;
}

export async function fetchChatworkActivities(
  apiToken: string,
  myAccountId: number,
  roomIds: number[] | null, // null = all rooms
  range: DateRange,
): Promise<ActivityEntry[]> {
  const client = createClient(apiToken);
  let rooms: ChatworkRoom[];

  if (roomIds && roomIds.length > 0) {
    rooms = roomIds.map((id) => ({ room_id: id, name: `Room ${id}`, type: 'group' as const }));
  } else {
    rooms = await fetchMyRooms(client);
    // Filter out rooms with no activity on the target day using last_update_time
    const startUnix = Math.floor(range.start.getTime() / 1000);
    const totalRooms = rooms.length;
    rooms = rooms.filter(
      (r) => r.last_update_time === undefined || r.last_update_time >= startUnix,
    );
    console.log(
      `  [Chatwork] ${totalRooms} rooms total → ${rooms.length} active on ${range.label}`,
    );
  }

  console.log(`  [Chatwork] Scanning ${rooms.length} room(s)…`);

  const entries: ActivityEntry[] = [];

  for (const room of rooms) {
    process.stdout.write(`    → ${room.name || room.room_id}… `);
    try {
      const messages = await fetchMessagesFromRoom(client, room.room_id);

      const mine = messages.filter((msg) => {
        if (msg.account.account_id !== myAccountId) return false;
        const ts = new Date(msg.send_time * 1000);
        return ts >= range.start && ts < range.end;
      });

      if (mine.length === 0) {
        process.stdout.write('no messages\n');
        continue;
      }

      process.stdout.write(`${mine.length} message(s)\n`);

      for (const msg of mine) {
        entries.push({
          source: 'chatwork',
          timestamp: new Date(msg.send_time * 1000),
          roomOrRepo: room.name || String(room.room_id),
          eventType: 'Message',
          summary: trimBody(msg.body),
        });
      }
    } catch (err) {
      process.stdout.write(`ERROR\n`);
      const message = err instanceof Error ? err.message : String(err);
      console.error(`    [!] Room ${room.room_id}: ${message}`);
    }
  }

  return entries;
}
