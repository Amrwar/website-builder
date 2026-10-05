/**
 * Shared overlay appearance.
 *
 * Dialogs, drawers, menus, selects and tooltips are all floating surfaces and
 * must read as one family. Keeping the classes here means a change to
 * elevation or border lands everywhere at once instead of in whichever
 * component someone remembered to update.
 */

/** Dimmed backdrop behind a modal surface. */
export const OVERLAY_BACKDROP = [
  "fixed inset-0 z-40 bg-inverse/40",
  "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
].join(" ");

/** A floating panel: menus, selects, popovers. */
export const OVERLAY_PANEL = [
  "z-50 overflow-hidden rounded-md border border-line-subtle bg-overlay shadow-lg",
  "data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out",
].join(" ");

/** A row inside a floating panel. */
export const OVERLAY_ITEM = [
  "relative flex cursor-pointer select-none items-center gap-2.5",
  "rounded-sm px-2.5 py-2 text-body-sm text-primary outline-none",
  "transition-colors duration-fast ease-out-quint",
  // Radix drives highlight via data-highlighted, which follows both pointer
  // and keyboard, so hover and arrow-key navigation look identical.
  "data-[highlighted]:bg-hover data-[highlighted]:text-primary",
  "data-[disabled]:pointer-events-none data-[disabled]:text-fg-disabled",
].join(" ");

/** Small caption row used as a group heading inside a panel. */
export const OVERLAY_LABEL = "px-2.5 py-1.5 text-eyebrow uppercase text-tertiary";
