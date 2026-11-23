import { describe, expect, it } from "vitest";
import { isPlainHttp, validateMusicServer } from "./musicServer";

const complete = { url: "https://music.example", username: "me", password: "hunter2" };

describe("validateMusicServer", () => {
  it("accepts a complete https server", () => {
    expect(validateMusicServer(complete)).toBeNull();
  });

  it("asks for an address", () => {
    expect(validateMusicServer({ ...complete, url: "   " })).toBe("network.error.address");
  });

  it("reads an address without a scheme as https", () => {
    expect(validateMusicServer({ ...complete, url: "music.example:4533" })).toBeNull();
  });

  it("refuses other schemes", () => {
    expect(validateMusicServer({ ...complete, url: "ftp://music.example" })).toBe("network.error.scheme");
  });

  it("accepts http when the user typed it", () => {
    expect(validateMusicServer({ ...complete, url: "http://192.168.1.5:4533" })).toBeNull();
    expect(isPlainHttp("http://192.168.1.5:4533")).toBe(true);
    expect(isPlainHttp("https://music.example")).toBe(false);
  });

  it("needs a username and a password", () => {
    expect(validateMusicServer({ ...complete, username: " " })).toBe("network.error.login");
    expect(validateMusicServer({ ...complete, password: "" })).toBe("network.error.login");
  });
});
