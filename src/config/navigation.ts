/**
 * Navigation registry.
 *
 * Shared by the header, the mobile menu and the footer so a link is declared
 * once. `status` tracks what actually exists: `live` items render as links,
 * `planned` items render as muted, non-interactive labels.
 *
 * This is deliberate rather than cosmetic -- a nav that links to routes which
 * do not exist yet ships 404s, and stubbing those routes with placeholder
 * pages is worse. Flip `status` to "live" in the same commit that adds the
 * route and the link activates everywhere at once.
 */

export type NavStatus = "live" | "planned";

export interface NavItem {
  /** Key under the `nav.*` or `footer.links.*` translation namespace. */
  key: string;
  href: string;
  status: NavStatus;
}

/**
 * Primary header navigation.
 *
 * `satisfies` rather than a type annotation: an annotation would widen `key`
 * to `string` and lose the literal types that make `t(item.key)` checkable
 * against the translation catalogue.
 */
export const PRIMARY_NAV = [
  { key: "howItWorks", href: "#how-it-works", status: "live" },
  { key: "whatsIncluded", href: "#whats-included", status: "live" },
  { key: "buildWall", href: "#build-wall", status: "live" },
] as const satisfies readonly NavItem[];

export interface FooterColumn {
  /** Key under the `footer.*` namespace. */
  titleKey: string;
  items: readonly NavItem[];
}

export const FOOTER_NAV = [
  {
    titleKey: "product",
    items: [
      { key: "howItWorks", href: "#how-it-works", status: "live" },
      { key: "pricing", href: "#pricing", status: "live" },
      { key: "buildWall", href: "#build-wall", status: "live" },
      { key: "maintenance", href: "/maintenance", status: "planned" },
    ],
  },
  {
    titleKey: "company",
    items: [
      { key: "partners", href: "/partners", status: "planned" },
      { key: "about", href: "/about", status: "planned" },
      { key: "contact", href: "/contact", status: "planned" },
    ],
  },
  {
    titleKey: "legal",
    items: [
      { key: "terms", href: "/terms", status: "planned" },
      { key: "privacy", href: "/privacy", status: "planned" },
      { key: "guarantee", href: "/guarantee-terms", status: "planned" },
    ],
  },
] as const satisfies readonly FooterColumn[];
