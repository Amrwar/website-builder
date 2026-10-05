"use client";

import type { ReactNode } from "react";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Edge-anchored panel.
 *
 * Built on Radix Dialog purely for behaviour -- focus trapping, focus return,
 * Escape handling, scroll locking and `aria-modal` wiring. All appearance is
 * ours. Anchors to the inline-end edge, so it opens from the right in English
 * and French and from the left in Arabic without a separate variant.
 */

export const Sheet = Dialog.Root;
export const SheetTrigger = Dialog.Trigger;
export const SheetClose = Dialog.Close;

export interface SheetContentProps {
  title: string;
  /** Visually hidden when the header shows no title text. */
  hideTitle?: boolean;
  description?: string;
  closeLabel: string;
  children: ReactNode;
  className?: string;
}

export function SheetContent({
  title,
  hideTitle = false,
  description,
  closeLabel,
  children,
  className,
}: SheetContentProps) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay
        className={cn(
          "fixed inset-0 z-40 bg-inverse/40",
          "data-[state=closed]:animate-fade-out data-[state=open]:animate-fade-in",
        )}
      />
      <Dialog.Content
        className={cn(
          "fixed inset-y-0 end-0 z-50 flex w-full max-w-sm flex-col",
          "border-s border-line bg-canvas shadow-lg",
          "data-[state=closed]:animate-sheet-out data-[state=open]:animate-sheet-in",
          className,
        )}
      >
        <div className="flex items-center justify-between border-b border-line-subtle px-5 py-4">
          {hideTitle ? (
            <Dialog.Title className="sr-only">{title}</Dialog.Title>
          ) : (
            <Dialog.Title className="text-body font-semibold text-primary">
              {title}
            </Dialog.Title>
          )}
          {description ? (
            <Dialog.Description className="sr-only">{description}</Dialog.Description>
          ) : null}
          <Dialog.Close
            className={cn(
              "grid size-8 place-items-center rounded-md text-secondary",
              "duration-fast transition-colors ease-out-quint",
              "hover:bg-hover hover:text-primary",
            )}
          >
            <X className="size-4" aria-hidden />
            <span className="sr-only">{closeLabel}</span>
          </Dialog.Close>
        </div>
        <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-5">
          {children}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
