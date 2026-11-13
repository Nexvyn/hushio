import { describe, expect, it } from "vitest";
import { greetingFor } from "./greeting";

const at = (hour: number, minute = 0) => new Date(2026, 10, 13, hour, minute);

describe("greetingFor", () => {
  it("greets in the morning from 05:00 to 11:59", () => {
    expect(greetingFor(at(5))).toBe("Good morning");
    expect(greetingFor(at(11, 59))).toBe("Good morning");
  });

  it("greets in the afternoon from 12:00 to 16:59", () => {
    expect(greetingFor(at(12))).toBe("Good afternoon");
    expect(greetingFor(at(16, 59))).toBe("Good afternoon");
  });

  it("greets in the evening from 17:00 to 04:59", () => {
    expect(greetingFor(at(17))).toBe("Good evening");
    expect(greetingFor(at(23, 59))).toBe("Good evening");
    expect(greetingFor(at(0))).toBe("Good evening");
    expect(greetingFor(at(4, 59))).toBe("Good evening");
  });
});
