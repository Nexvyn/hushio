import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Heart } from "@phosphor-icons/react";
import { CollectionHero } from "./CollectionHero";
import { PlayRound } from "./PlayRound";
import { PHONE_SHUFFLE } from "./phone/heroButtons";

vi.mock("../lib/usePhone", () => ({ usePhone: () => true }));

afterEach(cleanup);

describe("CollectionHero on phone", () => {
  it("renders Play and Shuffle as a paired row", () => {
    render(
      <CollectionHero title="Liked Songs" covers={[]} facts="12 songs" icon={Heart}>
        <PlayRound phone />
        <button type="button" aria-label="Shuffle" className={PHONE_SHUFFLE} />

      </CollectionHero>,
    );
    const play = screen.getByRole("button", { name: "Play" });
    const shuffle = screen.getByRole("button", { name: "Shuffle" });
    expect(play.parentElement).toBe(shuffle.parentElement);
    expect(play.className).toContain("var(--primary)");
    expect(shuffle.className).toContain("var(--wash)");
  });

  it("shows the icon tile, not a letter, when there is no artwork", () => {
    const { container } = render(
      <CollectionHero title="Liked Songs" covers={[]} facts="12 songs" icon={Heart}>
        <span />
      </CollectionHero>,
    );
    const tile = screen.getByTestId("page-tile");
    expect(tile.querySelector("svg")).not.toBeNull();
    expect(tile.textContent).toBe("");
    expect(screen.queryByTestId("page-monogram")).toBeNull();
    expect(container.querySelector("header img")).toBeNull();
  });
});
