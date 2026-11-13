import { create } from "zustand";
import {
  connectPacket,
  decodePackets,
  decodePublish,
  disconnectPacket,
  isRoomCode,
  LISTEN_BROKER_URL,
  pingPacket,
  publishPacket,
  roomCode,
  subscribePacket,
  topicFor,
} from "../lib/listenTogether/mqtt";
import {
  encodeMessage,
  parseMessage,
  ServerClock,
  type ListenMessage,
  type Member,
  type RoomState,
  type Suggestion,
} from "../lib/listenTogether/protocol";

const PING_MS = 25_000;
const MEMBER_TIMEOUT_MS = 45_000;

export type RoomRole = "host" | "guest";
export type RoomStatus = "idle" | "connecting" | "joined" | "error";

export type ListenRoom = {
  code: string;
  role: RoomRole;
  status: RoomStatus;
  error: string | null;
  members: Member[];
  state: RoomState | null;
  suggestions: Suggestion[];
  driftMs: number;
};

const EMPTY_STATE: RoomState = {
  trackId: null,
  title: "",
  artist: "",
  thumb: null,
  position: 0,
  playing: false,
  updatedAt: 0,
};

type ListenState = {
  room: ListenRoom;
  join: (code: string, name: string, role: RoomRole) => Promise<boolean>;
  leave: () => void;
  publishState: (state: RoomState) => void;
  requestState: () => void;
  suggest: (suggestion: Suggestion) => void;
  approve: (suggestionId: string) => void;
  reject: (suggestionId: string) => void;
};

type Connection = {
  socket: WebSocket;
  members: Map<string, Member>;
  clock: ServerClock;
  ping: number;
  userId: string;
  name: string;
  role: RoomRole;
  code: string;
};

let connection: Connection | null = null;
let packetId = 1;

function memberOf(connection: Connection, userId: string, name: string, at: number): Member {
  const known = connection.members.get(userId);
  const member: Member = {
    id: userId,
    name: name || known?.name || "Guest",
    isHost: known?.isHost ?? (connection.role === "host" && userId === connection.userId),
    seenAt: at,
  };
  connection.members.set(userId, member);
  return member;
}

function send(raw: Uint8Array): void {
  if (connection?.socket.readyState === WebSocket.OPEN) {
    connection.socket.send(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer);
  }
}

function publish(message: ListenMessage): void {
  if (!connection) return;
  send(publishPacket(topicFor(connection.code), encodeMessage(message)));
}

function dropStale(connection: Connection, now: number): Member[] {
  for (const [id, member] of connection.members) {
    if (now - member.seenAt > MEMBER_TIMEOUT_MS) connection.members.delete(id);
  }
  return [...connection.members.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function handleMessage(connection: Connection, raw: string): void {
  const message = parseMessage(raw);
  if (!message) return;
  const now = Date.now();
  const store = useListenTogether.getState();
  switch (message.type) {
    case "hello": {
      memberOf(connection, message.userId, message.name, now);
      store.room.members = dropStale(connection, now);
      break;
    }
    case "bye": {
      connection.members.delete(message.userId);
      store.room.members = dropStale(connection, now);
      break;
    }
    case "state": {
      memberOf(connection, message.userId, "", now);
      connection.clock.observe(message.state.updatedAt, now);
      store.room.state = message.state;
      store.room.members = dropStale(connection, now);
      store.room.driftMs = connection.clock.elapsedSince(message.state.updatedAt, now);
      break;
    }
    case "request": {
      if (connection.role === "host") {
        const state = store.room.state;
        if (state) publish({ type: "state", userId: connection.userId, state, at: Date.now() });
      }
      break;
    }
    case "suggest": {
      const suggestion = { ...message.suggestion, fromName: message.name };
      store.room.suggestions = [
        ...store.room.suggestions.filter((entry) => entry.id !== suggestion.id),
        suggestion,
      ];
      break;
    }
    case "approve": {
      store.room.suggestions = store.room.suggestions.filter(
        (entry) => entry.id !== message.suggestionId,
      );
      break;
    }
    case "reject": {
      store.room.suggestions = store.room.suggestions.filter(
        (entry) => entry.id !== message.suggestionId,
      );
      break;
    }
  }
}

export const useListenTogether = create<ListenState>()((set, get) => ({
  room: {
    code: "",
    role: "guest",
    status: "idle",
    error: null,
    members: [],
    state: EMPTY_STATE,
    suggestions: [],
    driftMs: 0,
  },

  join: async (code, name, role) => {
    get().leave();
    const clean = code.trim().toUpperCase();
    if (!isRoomCode(clean)) {
      set({
        room: { ...get().room, status: "error", error: "That code isn't right. It has six letters and numbers." },
      });
      return false;
    }
    const userId = roomCode();
    const socket = new WebSocket(LISTEN_BROKER_URL);
    socket.binaryType = "arraybuffer";
    set({
      room: {
        ...get().room,
        code: clean,
        role,
        status: "connecting",
        error: null,
        members: [],
        state: EMPTY_STATE,
        suggestions: [],
        driftMs: 0,
      },
    });

    const fresh: Connection = {
      socket,
      members: new Map(),
      clock: new ServerClock(),
      ping: 0,
      userId,
      name: name.trim() || "Guest",
      role,
      code: clean,
    };

    await new Promise<void>((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      socket.onopen = () => {
        connection = fresh;
        socket.send(connectPacket(`hushio-${userId}`).buffer as ArrayBuffer);
        packetId = (packetId % 65535) + 1;
        socket.send(subscribePacket(packetId, topicFor(clean)).buffer as ArrayBuffer);
        fresh.ping = window.setInterval(() => send(pingPacket()), PING_MS);
        set({ room: { ...get().room, status: "joined" } });
        publish({ type: "hello", userId, name: fresh.name, at: Date.now() });
        finish();
      };
      socket.onerror = () => {
        set({ room: { ...get().room, status: "error", error: "Couldn't reach the relay." } });
        finish();
      };
      socket.onclose = () => {
        if (get().room.status === "joined") {
          set({ room: { ...get().room, status: "error", error: "The relay closed the connection." } });
        }
        finish();
      };
      socket.onmessage = (event) => {
        if (typeof event.data !== "string") return;
        const buffer = new TextEncoder().encode(event.data);
        const { packets } = decodePackets(buffer);
        for (const packet of packets) {
          if (packet.kind === 3) {
            const published = decodePublish(packet.body);
            if (published) handleMessage(fresh, published.payload);
          }
        }
      };
    });
    return get().room.status === "joined";
  },

  leave: () => {
    if (connection) {
      publish({ type: "bye", userId: connection.userId, at: Date.now() });
      window.clearInterval(connection.ping);
      send(disconnectPacket());
      connection.socket.close();
      connection = null;
    }
    set({
      room: {
        code: "",
        role: "guest",
        status: "idle",
        error: null,
        members: [],
        state: null,
        suggestions: [],
        driftMs: 0,
      },
    });
  },

  publishState: (state) => {
    publish({ type: "state", userId: connection?.userId ?? "", state, at: Date.now() });
  },

  requestState: () => {
    publish({ type: "request", userId: connection?.userId ?? "", at: Date.now() });
  },

  suggest: (suggestion) => {
    publish({
      type: "suggest",
      userId: connection?.userId ?? "",
      name: connection?.name ?? "Guest",
      suggestion,
      at: Date.now(),
    });
  },

  approve: (suggestionId) => {
    publish({ type: "approve", userId: connection?.userId ?? "", suggestionId, at: Date.now() });
  },

  reject: (suggestionId) => {
    publish({ type: "reject", userId: connection?.userId ?? "", suggestionId, at: Date.now() });
  },
}));

export function freshRoomCode(): string {
  return roomCode();
}
