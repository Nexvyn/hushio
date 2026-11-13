export const LISTEN_BROKER_URL = "wss://broker.emqx.io:8084/mqtt";
export const LISTEN_TOPIC_PREFIX = "hushio/listen";
export const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const ROOM_CODE_LENGTH = 6;
const CONNECT = 1;
const PUBLISH = 3;
const SUBSCRIBE = 8;
const PINGREQ = 12;
const DISCONNECT = 14;

export type Packet = { kind: number; body: Uint8Array };

export function encodeLength(length: number): number[] {
  const bytes: number[] = [];
  let value = length;
  do {
    let digit = value % 128;
    value = Math.floor(value / 128);
    if (value > 0) digit |= 0x80;
    bytes.push(digit);
  } while (value > 0);
  return bytes;
}

export function encodeString(text: string): number[] {
  const bytes: number[] = [];
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code < 0x80) {
      bytes.push(code);
    } else if (code < 0x800) {
      bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
    } else if (code < 0x10000) {
      bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
    } else {
      bytes.push(
        0xf0 | (code >> 18),
        0x80 | ((code >> 12) & 0x3f),
        0x80 | ((code >> 6) & 0x3f),
        0x80 | (code & 0x3f),
      );
    }
  }
  return bytes;
}

function withLength(kind: number, body: number[]): Uint8Array {
  return Uint8Array.from([kind, ...encodeLength(body.length), ...body]);
}

export function connectPacket(clientId: string, keepAliveSeconds = 60): Uint8Array {
  const body = [
    ...encodeString("MQTT"),
    0x04,
    0x02,
    (keepAliveSeconds >> 8) & 0xff,
    keepAliveSeconds & 0xff,
    ...encodeString(clientId),
  ];
  return withLength(CONNECT << 4, body);
}

export function subscribePacket(packetId: number, topic: string): Uint8Array {
  const body = [
    (packetId >> 8) & 0xff,
    packetId & 0xff,
    ...encodeString(topic),
    0x00,
  ];
  return withLength(SUBSCRIBE << 4, body);
}

export function publishPacket(topic: string, payload: string): Uint8Array {
  const topicBytes = encodeString(topic);
  const body = [
    (topicBytes.length >> 8) & 0xff,
    topicBytes.length & 0xff,
    ...topicBytes,
    ...encodeString(payload),
  ];
  return withLength(PUBLISH << 4, body);
}

export function pingPacket(): Uint8Array {
  return Uint8Array.from([PINGREQ << 4, 0]);
}

export function disconnectPacket(): Uint8Array {
  return Uint8Array.from([DISCONNECT << 4, 0]);
}

export function decodePackets(buffer: Uint8Array): { packets: Packet[]; rest: Uint8Array } {
  const packets: Packet[] = [];
  let offset = 0;
  while (offset < buffer.length) {
    const kind = buffer[offset] >> 4;
    let index = offset + 1;
    let multiplier = 1;
    let length = 0;
    let digit = 0;
    do {
      if (index >= buffer.length) return { packets, rest: buffer.slice(offset) };
      digit = buffer[index];
      index += 1;
      length += (digit & 0x7f) * multiplier;
      multiplier *= 128;
    } while ((digit & 0x80) !== 0);
    if (index + length > buffer.length) return { packets, rest: buffer.slice(offset) };
    packets.push({ kind, body: buffer.slice(index, index + length) });
    offset = index + length;
  }
  return { packets, rest: buffer.slice(offset) };
}

export function decodePublish(body: Uint8Array): { topic: string; payload: string } | null {
  if (body.length < 2) return null;
  const topicLength = (body[0] << 8) | body[1];
  if (body.length < 2 + topicLength) return null;
  const topic = new TextDecoder().decode(body.slice(2, 2 + topicLength));
  const payload = new TextDecoder().decode(body.slice(2 + topicLength));
  return { topic, payload };
}

export function roomCode(random: () => number = Math.random): string {
  let code = "";
  for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
    code += ROOM_ALPHABET[Math.floor(random() * ROOM_ALPHABET.length)];
  }
  return code;
}

export function topicFor(code: string): string {
  return `${LISTEN_TOPIC_PREFIX}/${code.toUpperCase()}`;
}

export function isRoomCode(value: string): boolean {
  const code = value.trim().toUpperCase();
  if (code.length !== ROOM_CODE_LENGTH) return false;
  return [...code].every((char) => ROOM_ALPHABET.includes(char));
}
