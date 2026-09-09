import { describe, expect, it } from "vitest";
import { inkOnAccent } from "../lib/jar-ink";

describe("inkOnAccent", () => {
  it("darkens amber toward cocoa ink", () => {
    expect(inkOnAccent("#E5B847")).toBe("#aa883a");
  });
  it("passes through invalid input unchanged", () => {
    expect(inkOnAccent("ocean")).toBe("ocean");
  });
});
