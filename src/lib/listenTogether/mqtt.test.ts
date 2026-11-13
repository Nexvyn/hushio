import { describe, expect, it } from "vitest";
import {
  connectPacket,
  decodePackets,
  decodePublish,
  encodeLength,
  isRoomCode,
  publishPacket,
  roomCode,
  subscribePacket,
  topicFor,
} from "./mqtt";
import {
  needsResync,
  parseMessage,
  ServerClock,
} from "./protocol";

describe("mqtt packets", () => {
  it("the remaining length uses the continuation form past 127 bytes", () => {
    expect(encodeLength(10)).toEqual([10]);
    expect(encodeLength(200)).toEqual([200 & 0x7f | 0x80, 1]);
  });

  it("the connect packet names the protocol and the client", () => {
    const packet = connectPacket("hushio-abc");
    expect(packet[0] >> 4).toBe(1);
    const text = new TextDecoder().decode(packet);
    expect(text).toContain("MQTT");
    expect(text).toContain("hushio-abc");
  });

  it("the subscribe packet carries the topic", () => {
    const packet = subscribePacket(1, "hushio/listen/ABC123");
    const text = new TextDecoder().decode(packet);
    expect(text).toContain("hushio/listen/ABC123");
  });

  it("a published message can be read back", () => {
    const packet = publishPacket("hushio/listen/ABC123", '{"type":"hello"}');
    const { packets, rest } = decodePackets(packet);
    expect(rest.length).toBe(0);
    expect(packets).toHaveLength(1);
    expect(packets[0].kind).toBe(3);
    const published = decodePublish(packets[0].body);
    expect(published?.topic).toBe("hushio/listen/ABC123");
    expect(published?.payload).toBe('{"type":"hello"}');
  });

  it("a partial packet is kept for the next read", () => {
    const packet = publishPacket("a/b", "hello");
    const cut = packet.slice(0, packet.length - 2);
    const { packets, rest } = decodePackets(cut);
    expect(packets).toHaveLength(0);
    expect(rest.length).toBe(cut.length);
  });
});

describe("room codes", () => {
  it("uses only letters and numbers that are easy to read out", () => {
    const code = roomCode(() => 0.5);
    expect(code).toHaveLength(6);
    expect(code).toBe("SSSSSS");
    expect(code).not.toMatch(/[O0IL1]/);
  });

  it("checks a code someone typed in", () => {
    expect(isRoomCode("ABC234")).toBe(true);
    expect(isRoomCode("abc234")).toBe(true);
    expect(isRoomCode("ABC23")).toBe(false);
    expect(isRoomCode("ABC230")).toBe(false);
    expect(isRoomCode("ABC1O3")).toBe(false);
  });

  it("gives every room its own topic", () => {
    expect(topicFor("abc234")).toBe("hushio/listen/ABC234");
  });
});

describe("room messages", () => {
  it("reads a message back", () => {
    const message = parseMessage('{"type":"hello","userId":"u1","name":"Arya","at":5}');
    expect(message?.type).toBe("hello");
  });

  it("refuses anything that is not a message", () => {
    expect(parseMessage("not json")).toBeNull();
    expect(parseMessage("{}")).toBeNull();
  });
});

describe("server clock", () => {
  it("keeps the smallest delay as the estimate", () => {
    const clock = new ServerClock();
    clock.observe(1_000, 1_120);
    clock.observe(1_000, 1_180);
    expect(clock.offset(1_200)).toBe(120);
  });

  it("measures how far the room has moved on", () => {
    const clock = new ServerClock();
    clock.observe(1_000, 1_100);
    expect(clock.elapsedSince(1_000, 3_100)).toBe(2_000);
  });

  it("asks for a resync when the drift is more than the tolerance", () => {
    expect(needsResync(1_000, 1_500)).toBe(false);
    expect(needsResync(1_000, 5_000)).toBe(true);
  });
});
