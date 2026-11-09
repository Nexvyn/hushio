import config from "../../tailwind.config.js";
import configSource from "../../tailwind.config.js?raw";
import { describe, expect, it } from "vitest";

type Colour = string | ((options: { opacityValue: string }) => string);

const colours = config.theme.extend.colors as Record<string, Colour>;

describe("text-art colour", () => {
  it("resolves to the on-art token", () => {
    const art = colours.art;
    const value = typeof art === "function" ? art({ opacityValue: "1" }) : art;
    expect(value).toContain("var(--on-art)");
    expect(value).not.toContain("var(--art)");
  });

  it("has a single art colour definition", () => {
    const coloursBlock = configSource.slice(configSource.indexOf("colors: {"));
    expect(coloursBlock.match(/^\s+art:/gm)?.length).toBe(1);
  });
});
