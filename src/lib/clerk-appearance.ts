/**
 * Clerk theming.
 *
 * Clerk's widgets render into our DOM, so they are styled from the same CSS
 * custom properties as everything else rather than from a copied palette.
 * That is what keeps them correct in dark mode and in Arabic without a second
 * set of overrides: the tokens already flip, and these follow.
 *
 * Only the variables and a handful of structural elements are set. Fighting
 * Clerk's internals class-by-class produces a brittle skin that breaks on
 * their next release; matching the tokens gets most of the way at a fraction
 * of the maintenance.
 */
/*
 * Deliberately unannotated. Clerk 7 dropped `@clerk/types` from the
 * dependency tree and declares the `appearance` prop as `any`, so an
 * annotation here would check nothing while implying it did. The shape is
 * validated by the widgets rendering correctly, not by the compiler.
 */
export const clerkAppearance = {
  variables: {
    colorPrimary: "var(--action-primary-bg)",
    colorText: "var(--text-primary)",
    colorTextSecondary: "var(--text-secondary)",
    colorBackground: "var(--surface-canvas)",
    colorInputBackground: "var(--surface-canvas)",
    colorInputText: "var(--text-primary)",
    colorDanger: "var(--status-danger-fg)",
    colorSuccess: "var(--status-success-fg)",
    colorWarning: "var(--status-warning-fg)",
    borderRadius: "0.375rem",
    fontFamily: "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif",
    fontSize: "0.875rem",
  },
  elements: {
    // The card sits on our own page background, so it carries a hairline
    // border like every other surface rather than a drop shadow.
    card: "shadow-none border border-line bg-canvas",
    cardBox: "shadow-none",
    headerTitle: "text-display-sm text-primary",
    headerSubtitle: "text-body-sm text-secondary",
    formButtonPrimary:
      "bg-action text-action-fg hover:bg-action-hover normal-case text-body-sm font-medium",
    formFieldInput: "border-line bg-canvas text-primary",
    footerActionLink: "text-accent hover:text-accent",
    // Clerk's default badge is noise on a page that already says where it is.
    logoBox: "hidden",
  },
};
