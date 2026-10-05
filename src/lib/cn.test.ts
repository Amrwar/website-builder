import { describe, expect, it } from "vitest";

import { cn } from "./cn";

describe("cn", () => {
  it("resolves conflicting utilities so the last one wins", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("keeps a custom font size and a custom text colour together", () => {
    // The regression this guards: tailwind-merge treating `text-body-sm` and
    // `text-secondary` as the same class group and dropping the font size.
    const result = cn("text-body-sm", "text-secondary");
    expect(result).toContain("text-body-sm");
    expect(result).toContain("text-secondary");
  });

  it("still resolves two custom font sizes against each other", () => {
    expect(cn("text-body", "text-display-lg")).toBe("text-display-lg");
  });

  it("still resolves two custom text colours against each other", () => {
    expect(cn("text-secondary", "text-primary")).toBe("text-primary");
  });

  it("resolves custom background and border colours", () => {
    expect(cn("bg-canvas", "bg-subtle")).toBe("bg-subtle");
    expect(cn("border-line", "border-line-strong")).toBe("border-line-strong");
  });

  it("lets a caller override a component default", () => {
    // The core contract every component relies on for its `className` prop.
    expect(cn("bg-canvas text-primary", "bg-inverse")).toBe("text-primary bg-inverse");
  });

  it("ignores falsy values", () => {
    expect(cn("p-2", false, undefined, null, "", "m-1")).toBe("p-2 m-1");
  });
});
