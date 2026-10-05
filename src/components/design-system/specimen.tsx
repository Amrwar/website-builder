import type { ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Showcase layout primitives.
 *
 * Internal tooling, not product surface. Copy here is intentionally English
 * only: translating a developer reference into three languages would triple
 * the catalogues and the parity test for something no customer ever opens.
 */

export function ShowcaseSection({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 border-t border-line-subtle py-14">
      <div className="flex max-w-2xl flex-col gap-2">
        <h2 className="text-display-md text-primary">{title}</h2>
        {description ? (
          <p className="text-body-sm text-secondary">{description}</p>
        ) : null}
      </div>
      <div className="mt-8 flex flex-col gap-10">{children}</div>
    </section>
  );
}

export function Specimen({
  title,
  note,
  children,
  /** Lays the examples out in a row that wraps, rather than stacked. */
  inline = false,
  className,
}: {
  title: string;
  note?: string;
  children: ReactNode;
  inline?: boolean;
  className?: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-body-sm font-semibold text-primary">{title}</h3>
        {note ? <p className="max-w-prose text-caption text-secondary">{note}</p> : null}
      </div>
      <div
        className={cn(
          "rounded-lg border border-line bg-canvas p-6",
          inline ? "flex flex-wrap items-center gap-4" : "flex flex-col gap-4",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}

/** Labels a single example inside a specimen. */
export function Variant({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <span className="text-eyebrow text-tertiary uppercase">{label}</span>
      {children}
    </div>
  );
}
