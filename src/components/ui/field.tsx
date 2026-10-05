"use client";

import { createContext, useContext, useId, type ReactNode } from "react";

import { cn } from "@/lib/cn";

/**
 * Form field wrapper.
 *
 * Owns id generation and the `aria-describedby` / `aria-invalid` wiring so a
 * control is correctly labelled, described and error-announced without each
 * call site rebuilding that relationship. Getting this wrong is the single
 * most common accessibility defect in forms, and it is invisible until someone
 * uses a screen reader.
 */

interface FieldContextValue {
  controlId: string;
  descriptionId: string;
  errorId: string;
  hasDescription: boolean;
  invalid: boolean;
  required: boolean;
  disabled: boolean;
}

const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * Props a control should spread onto its input element.
 * Returns an empty object outside a `<Field>`, so controls stay usable
 * standalone rather than throwing.
 */
export function useFieldControl(): {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: true;
  "aria-required"?: true;
  disabled?: boolean;
} {
  const field = useContext(FieldContext);
  if (!field) return {};

  const describedBy = [
    field.hasDescription ? field.descriptionId : null,
    field.invalid ? field.errorId : null,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id: field.controlId,
    ...(describedBy ? { "aria-describedby": describedBy } : {}),
    ...(field.invalid ? { "aria-invalid": true as const } : {}),
    ...(field.required ? { "aria-required": true as const } : {}),
    ...(field.disabled ? { disabled: true } : {}),
  };
}

export interface FieldProps {
  label: ReactNode;
  /** Helper text shown under the label and linked via aria-describedby. */
  description?: ReactNode;
  /** Presence marks the field invalid and announces the message. */
  error?: ReactNode;
  required?: boolean;
  disabled?: boolean;
  /** Hide the label visually while keeping it for assistive technology. */
  hideLabel?: boolean;
  children: ReactNode;
  className?: string;
}

export function Field({
  label,
  description,
  error,
  required = false,
  disabled = false,
  hideLabel = false,
  children,
  className,
}: FieldProps) {
  const id = useId();
  const value: FieldContextValue = {
    controlId: `${id}-control`,
    descriptionId: `${id}-description`,
    errorId: `${id}-error`,
    hasDescription: Boolean(description),
    invalid: Boolean(error),
    required,
    disabled,
  };

  return (
    <FieldContext.Provider value={value}>
      <div className={cn("flex flex-col gap-2", className)}>
        <label
          htmlFor={value.controlId}
          className={cn(
            "text-body-sm font-medium text-primary",
            hideLabel && "sr-only",
            disabled && "text-fg-disabled",
          )}
        >
          {label}
          {required ? (
            <span className="ms-1 text-danger" aria-hidden>
              *
            </span>
          ) : null}
        </label>

        {description ? (
          <p id={value.descriptionId} className="text-caption text-secondary">
            {description}
          </p>
        ) : null}

        {children}

        {error ? (
          /* Assertive: an inline validation error appears in response to the
           * user's own action and should interrupt rather than queue. */
          <p
            id={value.errorId}
            role="alert"
            aria-live="assertive"
            className="text-caption text-danger"
          >
            {error}
          </p>
        ) : null}
      </div>
    </FieldContext.Provider>
  );
}
