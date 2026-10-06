import "server-only";

import { and, desc, eq, isNull } from "drizzle-orm";

import {
  NEXT_ACTION_BY_STATUS,
  countdownRuns,
  stageStates,
  workspaceFor,
  type WorkspaceDefinition,
} from "@/config/workspace";
import { db } from "@/db/client";
import {
  changeRequests,
  deployments,
  invoices,
  orders,
  projectApprovals,
  projectEvents,
  projectFiles,
  projectMembers,
  projectMessages,
  projects,
  users,
  type ChangeRequest,
  type Deployment,
  type Invoice,
  type Order,
  type Project,
  type ProjectApproval,
  type ProjectEvent,
  type ProjectFile,
  type ProjectMessage,
} from "@/db/schema";
import { ApiError } from "@/lib/api/response";
import { deadlineStanding, type DeadlineStanding } from "@/lib/schedule/deadline";
import type { AuthContext } from "@/server/auth";

/**
 * Reading a Build Room.
 *
 * One query module assembles the whole workspace, which keeps two rules in one
 * place instead of spread across nine panels:
 *
 *  1. **Authorization is applied at the query, not at the component.** The
 *     project lookup is scoped to the viewer, and internal files are filtered
 *     out in SQL. A panel that forgets to check something cannot leak, because
 *     the data never reached it.
 *  2. **The viewer's capabilities travel with the data.** Panels render from
 *     `viewer`, so what a customer sees and what a developer sees differ by
 *     configuration rather than by duplicated conditionals.
 */

export interface WorkspaceViewer {
  userId: string;
  isOwner: boolean;
  isStaff: boolean;
  /** Whether this viewer may act, not merely look. */
  canManageProject: boolean;
  canExecuteBuild: boolean;
  canSeeInternal: boolean;
}

export interface WorkspaceDeadline {
  deadlineAt: Date;
  standing: DeadlineStanding;
  /** True when the clock is running right now. */
  running: boolean;
}

export interface TeamMember {
  userId: string;
  name: string;
  role: string;
}

export interface Workspace {
  project: Project;
  definition: WorkspaceDefinition;
  stages: ReturnType<typeof stageStates>;
  nextAction: string | null;
  deadline: WorkspaceDeadline | null;
  team: TeamMember[];
  files: ProjectFile[];
  messages: (ProjectMessage & { attachments: ProjectFile[] })[];
  changeRequests: ChangeRequest[];
  approvals: ProjectApproval[];
  deployments: Deployment[];
  latestPreview: Deployment | null;
  latestProduction: Deployment | null;
  order: Order | null;
  invoices: Invoice[];
  activity: ProjectEvent[];
  unreadCount: number;
  viewer: WorkspaceViewer;
}

/**
 * Loads a project the viewer is allowed to open.
 *
 * Scoped in SQL: a customer's lookup carries their own id, so there is no
 * window in which someone else's project exists in memory unguarded. A caller
 * asking for a project they cannot see gets `not_found`, never `forbidden` --
 * a 403 would confirm the reference is real.
 */
async function loadProject(reference: string, context: AuthContext): Promise<Project> {
  const canReadAll = context.can("project:read:all");

  const project = await db.query.projects.findFirst({
    where: canReadAll
      ? eq(projects.reference, reference)
      : and(eq(projects.reference, reference), eq(projects.ownerId, context.user.id)),
  });

  if (!project) throw new ApiError("not_found", "Not found.");
  return project;
}

export async function getWorkspace(
  reference: string,
  context: AuthContext,
): Promise<Workspace> {
  const project = await loadProject(reference, context);

  const isOwner = project.ownerId === context.user.id;
  const isStaff = context.can("project:read:all");

  const viewer: WorkspaceViewer = {
    userId: context.user.id,
    isOwner,
    isStaff,
    canManageProject: context.can("project:manage"),
    canExecuteBuild: context.can("build:execute"),
    // Internal notes and working files stay with the team. The customer owns
    // the product, not our workings.
    canSeeInternal: isStaff,
  };

  const definition = workspaceFor(project.productType);

  const fileVisibility = viewer.canSeeInternal
    ? undefined
    : eq(projectFiles.visibility, "customer");

  const [
    memberRows,
    fileRows,
    messageRows,
    changeRows,
    approvalRows,
    deploymentRows,
    orderRow,
    activityRows,
  ] = await Promise.all([
    db
      .select({
        userId: projectMembers.userId,
        role: projectMembers.role,
        lastReadAt: projectMembers.lastReadAt,
        name: users.displayName,
        email: users.email,
      })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(
        and(eq(projectMembers.projectId, project.id), isNull(projectMembers.removedAt)),
      ),

    db
      .select()
      .from(projectFiles)
      .where(
        fileVisibility
          ? and(
              eq(projectFiles.projectId, project.id),
              isNull(projectFiles.deletedAt),
              fileVisibility,
            )
          : and(eq(projectFiles.projectId, project.id), isNull(projectFiles.deletedAt)),
      )
      .orderBy(desc(projectFiles.createdAt)),

    db
      .select()
      .from(projectMessages)
      .where(eq(projectMessages.projectId, project.id))
      .orderBy(desc(projectMessages.createdAt))
      .limit(100),

    db
      .select()
      .from(changeRequests)
      .where(eq(changeRequests.projectId, project.id))
      .orderBy(desc(changeRequests.createdAt)),

    db
      .select()
      .from(projectApprovals)
      .where(eq(projectApprovals.projectId, project.id))
      .orderBy(desc(projectApprovals.requestedAt)),

    db
      .select()
      .from(deployments)
      .where(eq(deployments.projectId, project.id))
      .orderBy(desc(deployments.createdAt)),

    db.query.orders.findFirst({ where: eq(orders.projectId, project.id) }),

    db
      .select()
      .from(projectEvents)
      .where(eq(projectEvents.projectId, project.id))
      .orderBy(desc(projectEvents.occurredAt))
      .limit(200),
  ]);

  // Invoices hang off the order, not the project, so they are fetched once the
  // order is known rather than guessed at above.
  const invoiceList = orderRow
    ? await db.select().from(invoices).where(eq(invoices.orderId, orderRow.id))
    : [];

  const filesById = new Map(fileRows.map((file) => [file.id, file]));

  const deadline: WorkspaceDeadline | null = project.deadlineAt
    ? {
        deadlineAt: project.deadlineAt,
        standing: deadlineStanding(project.deadlineAt),
        running: countdownRuns(project.productType, project.status),
      }
    : null;

  const self = memberRows.find((member) => member.userId === context.user.id);
  const lastReadAt = self?.lastReadAt ?? null;
  const unreadCount = lastReadAt
    ? activityRows.filter((event) => event.occurredAt > lastReadAt).length
    : activityRows.length;

  return {
    project,
    definition,
    stages: stageStates(project.productType, project.status),
    nextAction: NEXT_ACTION_BY_STATUS[project.status],
    deadline,
    team: memberRows.map((member) => ({
      userId: member.userId,
      name: member.name ?? member.email,
      role: member.role,
    })),
    files: fileRows,
    messages: messageRows.map((message) => ({
      ...message,
      attachments: message.attachmentFileIds
        .map((id) => filesById.get(id))
        .filter((file): file is ProjectFile => Boolean(file)),
    })),
    changeRequests: changeRows,
    approvals: approvalRows,
    deployments: deploymentRows,
    latestPreview:
      deploymentRows.find(
        (row) => row.environment === "preview" && row.state === "ready",
      ) ?? null,
    latestProduction:
      deploymentRows.find(
        (row) => row.environment === "production" && row.state === "ready",
      ) ?? null,
    order: orderRow ?? null,
    invoices: invoiceList,
    activity: activityRows,
    unreadCount,
    viewer,
  };
}

/** The customer's project list, newest first. */
export async function listProjectsForCaller(context: AuthContext): Promise<Project[]> {
  const canReadAll = context.can("project:read:all");

  return db
    .select()
    .from(projects)
    .where(canReadAll ? undefined : eq(projects.ownerId, context.user.id))
    .orderBy(desc(projects.createdAt))
    .limit(50);
}

/** Marks the activity feed read up to now for this viewer. */
export async function markWorkspaceRead(
  projectId: string,
  userId: string,
): Promise<void> {
  await db
    .update(projectMembers)
    .set({ lastReadAt: new Date() })
    .where(
      and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)),
    );
}
