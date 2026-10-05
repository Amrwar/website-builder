import type { Metadata } from "next";

import { Container } from "@/components/layout/container";
import { ControlsShowcase } from "@/components/design-system/controls";
import { DataDisplayShowcase } from "@/components/design-system/data-display";
import { FoundationsShowcase } from "@/components/design-system/foundations";
import { OverlaysShowcase } from "@/components/design-system/overlays";
import { StatesShowcase } from "@/components/design-system/states";

/**
 * Design-system reference.
 *
 * Reachable in every environment rather than gated to development, because
 * its main value is reviewing the system on a preview deployment and on a
 * real phone. It is kept out of search and out of the navigation instead.
 *
 * Copy here is English only by design: this is developer tooling, and
 * translating it would triple the message catalogues and the parity test for
 * a page no customer opens.
 */

export const metadata: Metadata = {
  title: "Design system",
  description: "Component and token reference.",
  robots: { index: false, follow: false },
};

const SECTIONS = [
  { id: "foundations", label: "Foundations" },
  { id: "controls", label: "Controls" },
  { id: "navigation-overlays", label: "Navigation and overlays" },
  { id: "states", label: "Status and states" },
  { id: "data-display", label: "Data display" },
] as const;

export default function DesignSystemPage() {
  return (
    <Container width="wide" className="py-14 sm:py-20">
      <header className="flex max-w-3xl flex-col gap-4">
        <p className="text-eyebrow text-tertiary uppercase">Internal reference</p>
        <h1 className="text-display-xl text-primary">Design system</h1>
        <p className="text-body-lg text-secondary">
          Every token and component in the product, with the states each one has to
          handle. Resize the window to check tablet and phone behaviour, and use Tab to
          walk the keyboard path through each specimen.
        </p>
      </header>

      <nav aria-label="Design system sections" className="mt-10">
        <ul className="flex flex-wrap gap-2">
          {SECTIONS.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="duration-fast inline-flex rounded-md border border-line px-3 py-1.5 text-body-sm text-secondary transition-colors ease-out-quint hover:border-line-strong hover:text-primary"
              >
                {section.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <FoundationsShowcase />
      <ControlsShowcase />
      <OverlaysShowcase />
      <StatesShowcase />
      <DataDisplayShowcase />
    </Container>
  );
}
