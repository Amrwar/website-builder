"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { X } from "lucide-react";

import { cn } from "@/lib/cn";

/**
 * Transient notifications.
 *
 * The viewport is rendered permanently, empty or not. Screen readers only
 * announce changes inside a live region that already existed when the change
 * happened -- mounting the region together with its first message is the usual
 * reason toasts are silent to assistive technology.
 *
 * Toasts are for acknowledging something that already happened. Anything the
 * user must act on belongs in the page, not in a message that disappears.
 */

export type ToastTone = "neutral" | "success" | "warning" | "danger";

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: ToastTone;
  /** Milliseconds before auto-dismiss. `null` keeps it until dismissed. */
  duration?: number | null;
  /** A single action, e.g. "Undo". Keep it to one. */
  action?: { label: string; onClick: () => void };
}

interface Toast extends ToastOptions {
  id: string;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => string;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within <ToastProvider>.");
  }
  return context;
}

const DEFAULT_DURATION = 5000;
/** Errors persist: a message the user missed is worse than one they must close. */
const DANGER_DURATION = null;
/** Older toasts are dropped beyond this, so the viewport cannot fill the screen. */
const MAX_VISIBLE = 4;

export interface ToastProviderProps {
  children: ReactNode;
  /** Accessible label for the notification region. */
  label: string;
  dismissLabel: string;
}

export function ToastProvider({ children, label, dismissLabel }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((item) => item.id !== id));
  }, []);

  const toast = useCallback(
    (options: ToastOptions) => {
      const id = crypto.randomUUID();
      const tone = options.tone ?? "neutral";
      const duration =
        options.duration !== undefined
          ? options.duration
          : tone === "danger"
            ? DANGER_DURATION
            : DEFAULT_DURATION;

      setToasts((current) => [...current, { ...options, tone, id }].slice(-MAX_VISIBLE));

      if (duration !== null) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }

      return id;
    },
    [dismiss],
  );

  /** Clear outstanding timers on unmount so nothing fires into a dead tree. */
  useEffect(() => {
    const map = timers.current;
    return () => {
      for (const timer of map.values()) clearTimeout(timer);
      map.clear();
    };
  }, []);

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport
        toasts={toasts}
        onDismiss={dismiss}
        label={label}
        dismissLabel={dismissLabel}
      />
    </ToastContext.Provider>
  );
}

const TONE_STYLES: Record<ToastTone, string> = {
  neutral: "border-line bg-overlay",
  success: "border-success-line bg-overlay",
  warning: "border-warning-line bg-overlay",
  danger: "border-danger-line bg-overlay",
};

const TONE_ACCENT: Record<ToastTone, string> = {
  neutral: "bg-tertiary",
  success: "bg-success",
  warning: "bg-warning",
  danger: "bg-danger",
};

function ToastViewport({
  toasts,
  onDismiss,
  label,
  dismissLabel,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
  label: string;
  dismissLabel: string;
}) {
  return (
    <div
      // `region` + label makes the area reachable by landmark navigation.
      role="region"
      aria-label={label}
      className={cn(
        "pointer-events-none fixed z-50 flex flex-col gap-2",
        // Bottom on phones where the thumb is, top-end on larger screens.
        // Clears the 64px sticky header rather than covering its controls.
        "inset-x-4 bottom-4 sm:inset-x-auto sm:end-6 sm:top-20 sm:bottom-auto sm:w-90",
      )}
    >
      {toasts.map((item) => (
        <ToastItem
          key={item.id}
          toast={item}
          onDismiss={onDismiss}
          dismissLabel={dismissLabel}
        />
      ))}
    </div>
  );
}

function ToastItem({
  toast,
  onDismiss,
  dismissLabel,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
  dismissLabel: string;
}) {
  const tone = toast.tone ?? "neutral";

  return (
    <div
      // Errors interrupt; everything else waits for a pause in speech.
      role={tone === "danger" ? "alert" : "status"}
      aria-live={tone === "danger" ? "assertive" : "polite"}
      className={cn(
        "pointer-events-auto flex animate-sheet-in items-start gap-3",
        "overflow-hidden rounded-md border p-4 shadow-lg",
        TONE_STYLES[tone],
      )}
    >
      {/* Colour is reinforced by position, not used as the only signal. */}
      <span
        aria-hidden
        className={cn(
          "mt-1 h-full w-0.5 shrink-0 self-stretch rounded-full",
          TONE_ACCENT[tone],
        )}
      />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="text-body-sm font-medium text-primary">{toast.title}</p>
        {toast.description ? (
          <p className="text-caption text-secondary">{toast.description}</p>
        ) : null}
        {toast.action ? (
          <button
            type="button"
            onClick={() => {
              toast.action?.onClick();
              onDismiss(toast.id);
            }}
            className="mt-1 self-start rounded-sm text-caption font-medium text-accent hover:underline"
          >
            {toast.action.label}
          </button>
        ) : null}
      </div>
      <button
        type="button"
        onClick={() => onDismiss(toast.id)}
        className={cn(
          "-me-1 -mt-1 grid size-7 shrink-0 place-items-center rounded-md text-tertiary",
          "duration-fast transition-colors ease-out-quint hover:bg-hover hover:text-primary",
        )}
      >
        <X className="size-3.5" aria-hidden />
        <span className="sr-only">{dismissLabel}</span>
      </button>
    </div>
  );
}
