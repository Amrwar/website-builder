import { BUILD_PRODUCTS, type BuildType } from "./products";

/**
 * Delivery platforms, per build type.
 *
 * Websites and business systems have exactly one option each. That is not a
 * placeholder for future choice -- it is the offer. Presenting a single
 * locked option is honest and takes one tap; inventing alternatives so the
 * step "feels" like a choice would be padding.
 *
 * Mobile is where the decision is real, and where it changes the work:
 * shipping one codebase to both stores is a different job from building two
 * native applications.
 */

export const PLATFORM_IDS = [
  "responsive_web",
  "web_app",
  "cross_platform",
  "ios",
  "android",
] as const;

export type PlatformId = (typeof PLATFORM_IDS)[number];

export interface PlatformOption {
  id: PlatformId;
  /**
   * Added complexity points. Cross-platform is the baseline at zero; native
   * work costs more because it is a second codebase, a second review process
   * and a second set of device behaviours.
   */
  points: number;
}

export const PLATFORMS_BY_BUILD_TYPE = {
  website: [{ id: "responsive_web", points: 0 }],
  system: [{ id: "web_app", points: 0 }],
  mobileApp: [
    { id: "cross_platform", points: 0 },
    { id: "ios", points: 4 },
    { id: "android", points: 4 },
  ],
} as const satisfies Record<BuildType, readonly PlatformOption[]>;

/** True when the build type lets the customer choose more than one platform. */
export function allowsMultiplePlatforms(buildType: BuildType): boolean {
  return BUILD_PRODUCTS[buildType].allowsMultiplePlatforms;
}

/** The option list for a build type. Never empty. */
export function platformsFor(buildType: BuildType): readonly PlatformOption[] {
  return PLATFORMS_BY_BUILD_TYPE[buildType];
}

/** The selection applied when a build type offers no real choice. */
export function defaultPlatformsFor(buildType: BuildType): PlatformId[] {
  if (allowsMultiplePlatforms(buildType)) return ["cross_platform"];

  // Every build type has at least one platform, but the index signature
  // cannot express that, so the fallback is explicit rather than asserted.
  const [first] = platformsFor(buildType);
  return first ? [first.id] : [];
}

/**
 * Rejects combinations that cannot be built as described.
 *
 * `cross_platform` means one codebase serving both stores, so pairing it with
 * a named native platform is a contradiction rather than a bigger order. This
 * is the check that stops someone assembling a scope we would have to go back
 * and renegotiate.
 */
export function platformConflict(
  buildType: BuildType,
  selected: readonly PlatformId[],
): "none" | "empty" | "cross_platform_with_native" | "not_available" {
  if (selected.length === 0) return "empty";

  const available = new Set(platformsFor(buildType).map((option) => option.id));
  if (selected.some((id) => !available.has(id))) return "not_available";

  if (selected.includes("cross_platform") && selected.length > 1) {
    return "cross_platform_with_native";
  }

  return "none";
}

export function platformPoints(
  buildType: BuildType,
  selected: readonly PlatformId[],
): number {
  const byId = new Map(
    platformsFor(buildType).map((option) => [option.id, option.points]),
  );
  return selected.reduce((total, id) => total + (byId.get(id) ?? 0), 0);
}
