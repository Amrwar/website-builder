/**
 * What the platform notifies people about, and whether they can turn it off.
 *
 * Two categories, and the distinction is not a preference:
 *
 *  - **Transactional** messages record something that happened to the person's
 *    money or their contractual position: an order paid, an invoice issued, a
 *    refund, a missed deadline and the choice it triggers. These ignore the
 *    notification toggles, because a receipt nobody can opt out of is the
 *    point of a receipt, and because the missed-deadline notice is how the
 *    customer learns they may claim a refund.
 *  - **Optional** messages are progress and conversation. These are gated on
 *    the recipient's own flags on `users`.
 *
 * Kept in `config/` because it is client-safe: the preferences screen needs to
 * explain which toggle governs what, and it must say the same thing the server
 * actually does rather than a second hand-maintained list.
 */

/** The flags on `users` a recipient can actually turn off. */
export const NOTIFICATION_PREFERENCES = [
  "notifyBuildUpdates",
  "notifyMessages",
  "notifyDeadlineAlerts",
  "notifyProductNews",
] as const;

export type NotificationPreference = (typeof NOTIFICATION_PREFERENCES)[number];

export interface NotificationKindDefinition {
  /**
   * The flag that governs it, or `null` when it is transactional and sends
   * regardless. `null` is a deliberate declaration, not a missing value.
   */
  preference: NotificationPreference | null;
  /** Whether it also goes out by email, when a transport is configured. */
  email: boolean;
}

/**
 * Every kind the platform can send.
 *
 * The key is stored on the row and is also the message path under the
 * `notifications` namespace, so adding a kind without adding its copy to all
 * three catalogues fails the catalogue type check rather than shipping a raw
 * key to a customer.
 */
export const NOTIFICATION_KINDS = {
  order_paid: { preference: null, email: true },
  invoice_issued: { preference: null, email: true },
  refund_issued: { preference: null, email: true },
  deadline_missed: { preference: null, email: true },

  build_started: { preference: "notifyBuildUpdates", email: true },
  preview_ready: { preference: "notifyBuildUpdates", email: true },
  project_launched: { preference: "notifyBuildUpdates", email: true },
  approval_requested: { preference: "notifyBuildUpdates", email: true },

  message_received: { preference: "notifyMessages", email: true },

  deadline_approaching: { preference: "notifyDeadlineAlerts", email: true },

  product_news: { preference: "notifyProductNews", email: true },
} as const satisfies Record<string, NotificationKindDefinition>;

export type NotificationKind = keyof typeof NOTIFICATION_KINDS;

export const NOTIFICATION_KIND_IDS = Object.keys(NOTIFICATION_KINDS) as [
  NotificationKind,
  ...NotificationKind[],
];

export function notificationKind(kind: NotificationKind): NotificationKindDefinition {
  return NOTIFICATION_KINDS[kind];
}

/** True when the recipient cannot switch this off. */
export function isTransactional(kind: NotificationKind): boolean {
  return NOTIFICATION_KINDS[kind].preference === null;
}
