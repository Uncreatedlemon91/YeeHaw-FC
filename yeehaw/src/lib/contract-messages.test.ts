import { describe, expect, it } from "vitest";
import { answeredOffer, chunkLines, offerButtons, offerMessage, squadAnnouncement, type OfferView } from "./contract-messages";

const offer: OfferView = {
  contractId: "c1",
  seasonName: "Season 3",
  seasonStartsAt: new Date("2027-01-12T00:00:00Z"),
  playerDiscordId: "111",
  terms: { shirtNumber: 10, squadStatus: "STARTER", position: "STRIKER", secondaryPosition: null, captaincy: "CAPTAIN", objectives: [{ kind: "GOALS", target: 10 }] },
};

describe("offer message", () => {
  it("carries Accept and Decline buttons that name the contract", () => {
    const ids = offerButtons("c1").components.map((c) => (c as { custom_id: string }).custom_id);
    expect(ids).toEqual(["ct:accept:c1", "ct:decline:c1"]);
    expect(offerMessage(offer).components).toHaveLength(1);
  });
  it("mentions the player only when posted in a channel", () => {
    expect(offerMessage(offer).content).toBeUndefined();
    expect(offerMessage(offer, { mention: true }).content).toBe("<@111>");
  });
  it("drops the buttons once answered", () => {
    expect(answeredOffer(offer, "accept").components).toEqual([]);
    expect(answeredOffer(offer, "decline").embeds[0].description).toMatch(/Declined/);
  });
});

describe("squad announcement", () => {
  it("groups by status, orders by number and shows armbands", () => {
    const e = squadAnnouncement("Season 3", [
      { name: "Bee", shirtNumber: 4, squadStatus: "STARTER", position: "CENTRE_BACK", captaincy: "VICE" },
      { name: "Ace", shirtNumber: 9, squadStatus: "STARTER", position: "STRIKER", captaincy: "CAPTAIN" },
      { name: "Cee", shirtNumber: 30, squadStatus: "SUBSTITUTE", position: null, captaincy: "NONE" },
    ]).embeds[0];
    expect(e.fields![0].value).toBe("Captain: Ace\nVice-captain: Bee");
    expect(e.fields![1].name).toBe("Starter (2)");
    expect(e.fields![1].value.split("\n")[0]).toContain("Bee");
    expect(e.fields!.map((f) => f.name)).toEqual(["Armbands", "Starter (2)", "Substitute (1)"]);
  });
  it("splits long lists under Discord's field limit", () => {
    const lines = Array.from({ length: 60 }, (_, i) => `${i} Some Player Name — Centre Midfield`);
    const chunks = chunkLines(lines);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((c) => c.length <= 1024)).toBe(true);
    expect(chunks.join("\n").split("\n")).toEqual(lines);
  });
});
