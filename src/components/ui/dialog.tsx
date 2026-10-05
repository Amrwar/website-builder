"use client";

import { useState, type ReactNode } from "react";

import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { OVERLAY_BACKDROP } from "./overlay-styles";

/**
 * Centred modal dialog.
 *
 * Radix supplies the behaviour that is tedious and easy to get wrong: focus is
 * trapped while open and returned to the trigger on close, Escape and
 * outside-click dismiss, the rest of the page is inert, and scroll is locked.
 * The appearance is entirely ours.
 *
 * A dialog interrupts. Use one when the task genuinely cannot continue until
 * it is resolved; otherwise put the content on the page.
 */

export const Dialog = RadixDialog.Root;
export const DialogTrigger = RadixDialog.Trigger;
export const DialogClose = RadixDialog.Close;

export interface DialogContentProps {
  title: string;
  /** Strongly recommended: describes the dialog for assistive technology. */
  description?: string;
  children?: ReactNode;
  /** Action row, right-aligned. Primary action last. */
  footer?: ReactNode;
  closeLabel: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE: Record<NonNullable<DialogContentProps["size"]>, string> = {
  sm: "max-w-sm",
  md: "max-w-lg",
  lg: "max-w-2xl",
};

export function DialogContent({
  title,
  description,
  children,
  footer,
  closeLabel,
  size = "md",
  className,
}: DialogContentProps) {
  return (
    <RadixDialog.Portal>
      <RadixDialog.Overlay className={OVERLAY_BACKDROP} />
      <RadixDialog.Content
        className={cn(
          "fixed start-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2",
          // RTL: the inline-start offset flips, so the centring must too.
          "rtl:translate-x-1/2",
          "flex max-h-[calc(100dvh-4rem)] flex-col",
          "rounded-lg border border-line-subtle bg-overlay shadow-lg",
          "data-[state=closed]:animate-dialog-out data-[state=open]:animate-dialog-in",
          SIZE[size],
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line-subtle px-6 py-4">
          <div className="flex min-w-0 flex-col gap-1">
            <RadixDialog.Title className="text-display-sm text-primary">
              {title}
            </RadixDialog.Title>
            {description ? (
              <RadixDialog.Description className="text-body-sm text-secondary">
                {description}
              </RadixDialog.Description>
            ) : null}
          </div>
          <RadixDialog.Close
            className={cn(
              "-me-2 -mt-1 grid size-8 shrink-0 place-items-center rounded-md text-secondary",
              "duration-fast transition-colors ease-out-quint hover:bg-hover hover:text-primary",
            )}
          >
            <X className="size-4" aria-hidden />
            <span className="sr-only">{closeLabel}</span>
          </RadixDialog.Close>
        </div>

        {children ? (
          <div className="flex-1 overflow-y-auto px-6 py-5 text-body-sm text-secondary">
            {children}
          </div>
        ) : null}

        {footer ? (
          <div className="flex flex-wrap justify-end gap-3 border-t border-line-subtle px-6 py-4">
            {footer}
          </div>
        ) : null}
      </RadixDialog.Content>
    </RadixDialog.Portal>
  );
}

export interface ConfirmDialogProps {
  trigger: ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  closeLabel: string;
  /** Marks the action destructive, which changes the confirm button only. */
  destructive?: boolean;
  /** May be async; the confirm button shows a pending state while it runs. */
  onConfirm: () => void | Promise<void>;
}

/**
 * Confirmation before a consequential action.
 *
 * Cancel is placed first and is the quieter control, so the destructive option
 * is never the one reached by reflex. The confirm button owns the pending
 * state: an action that takes time must not look like it was ignored, and the
 * dialog stays open until it resolves so a failure is still visible.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  confirmLabel,
  cancelLabel,
  closeLabel,
  destructive = false,
  onConfirm,
}: ConfirmDialogProps) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  async function handleConfirm() {
    setPending(true);
    try {
      await onConfirm();
      setOpen(false);
    } finally {
      setPending(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        // Closing mid-flight would strand the user with no idea whether the
        // action completed.
        if (!pending) setOpen(next);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent
        size="sm"
        title={title}
        description={description}
        closeLabel={closeLabel}
        footer={
          <>
            <DialogClose asChild>
              <Button variant="ghost" disabled={pending}>
                {cancelLabel}
              </Button>
            </DialogClose>
            <Button
              variant={destructive ? "danger" : "primary"}
              loading={pending}
              loadingLabel={confirmLabel}
              onClick={handleConfirm}
            >
              {confirmLabel}
            </Button>
          </>
        }
      />
    </Dialog>
  );
}
