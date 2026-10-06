/**
 * Promotes an account to a staff role.
 *
 *   node --env-file=.env.local scripts/promote-user.mjs <email> <role>
 *
 * This exists because of a genuine bootstrap problem: role changes require
 * `user:manage`, and the rank ladder means only an owner can appoint an
 * administrator. With no staff account in the database, there is nobody who
 * can create the first one -- so the first owner is made here, deliberately,
 * from a machine with database credentials.
 *
 * It writes an audit entry like any other role change, attributed to the
 * script rather than to a person, so the first promotion is as visible in the
 * log as every later one.
 *
 * After the first owner exists, use the console: /admin/team.
 */
import { Client } from "pg";

const VALID_ROLES = [
  "customer",
  "owner",
  "admin",
  "project_manager",
  "finance",
  "developer",
  "designer",
  "qa",
  "support",
];

const [, , email, role = "owner"] = process.argv;

if (!email) {
  console.error(
    "Usage: node --env-file=.env.local scripts/promote-user.mjs <email> [role]",
  );
  process.exit(1);
}

if (!VALID_ROLES.includes(role)) {
  console.error(`"${role}" is not a role. One of: ${VALID_ROLES.join(", ")}`);
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL });
await client.connect();

const found = await client.query(
  "select id, email, role, display_name from users where lower(email) = lower($1)",
  [email],
);

if (found.rowCount === 0) {
  console.error(`No account for ${email}.`);
  console.error("");
  console.error("The row is created on the first signed-in page load, so:");
  console.error("  1. Sign up at /sign-up");
  console.error("  2. Open /account once");
  console.error("  3. Run this again");
  await client.end();
  process.exit(1);
}

const user = found.rows[0];

if (user.role === role) {
  console.log(`${user.email} is already ${role}. Nothing to do.`);
  await client.end();
  process.exit(0);
}

await client.query("begin");
await client.query("update users set role = $1, updated_at = now() where id = $2", [
  role,
  user.id,
]);

await client.query(
  `insert into audit_events
     (category, action, actor_user_id, actor_email, actor_role,
      subject_type, subject_id, subject_label, before, after, reason)
   values ('security', 'user.role_changed', $1, $2, 'system',
           'user', $1, $2, $3::jsonb, $4::jsonb, $5)`,
  [
    user.id,
    user.email,
    JSON.stringify({ role: user.role }),
    JSON.stringify({ role }),
    "Bootstrap promotion via scripts/promote-user.mjs",
  ],
);

await client.query("commit");

console.log(`${user.email}: ${user.role} -> ${role}`);
console.log("Audit entry written. Open /admin to see the console.");

await client.end();
