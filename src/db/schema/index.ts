/**
 * Schema barrel.
 *
 * Drizzle needs every table and relation in one object to resolve relational
 * queries, so this re-export is the single place the schema is assembled.
 */
export * from "./enums";
export * from "./users";
export * from "./projects";
export * from "./briefs";
export * from "./scope-assessments";
export * from "./events";

/* --- Commerce ---------------------------------------------------------- */
export * from "./products";
export * from "./orders";
export * from "./payments";
export * from "./invoices";

/* --- Build Room -------------------------------------------------------- */
export * from "./workspace";

/* --- Production engine ------------------------------------------------- */
export * from "./production";

/* --- Launch, hosting and the post-delivery lifecycle -------------------- */
export * from "./launch";
export * from "./subscriptions";
export * from "./credits";

/* --- Growth ------------------------------------------------------------ */
export * from "./growth";

/* --- Admin ------------------------------------------------------------- */
export * from "./audit";
export * from "./refunds";
export * from "./catalog";
