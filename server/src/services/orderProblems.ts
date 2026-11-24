import type { Request } from "express";
import type { PoolClient } from "pg";
import { HttpError } from "../utils/httpError.js";
import { createNotification, notifyAdminsOfOrderProblem } from "../utils/notifications.js";
import { ADMIN_PAGE_SIZE, listPage, parsePage } from "../utils/pagination.js";
import { formatOrderCode } from "./orders/codes.js";
import { lockOrder } from "./orders/status.js";

// Problem reports (docs/product.md): the restaurant of an order reports a problem with it, from
// sending until PROBLEM_REPORT_HOURS after the order finished (several per order are fine), every
// admin is told, and an admin answers on its problem reports page (a status and a reply). The
// restaurant is told when its report gets a reply or is resolved. For now the admin handles them;
// later the delivery service's customer support will (docs/development-plan.md).

// The reasons a restaurant can choose, by the order's method when it reports.
export const PROBLEM_REASONS = {
  DELIVERY: ["LATE", "MISSING_ITEM", "DAMAGED", "COURIER", "PAYMENT", "OTHER"],
  PICKUP: ["PICKUP_TIME", "MISSING_ITEM", "DAMAGED", "STORE", "OTHER"],
} as const;

export const PROBLEM_STATUSES = ["OPEN", "IN_PROGRESS", "RESOLVED"] as const;
type ProblemStatus = (typeof PROBLEM_STATUSES)[number];

export const PROBLEM_REPORT_HOURS = 48;
const MAX_TEXT = 1000;

const NOT_FOUND = "Order not found.";

// The text of a report or a reply: null when empty, undefined when it is not valid.
const parseText = (value: unknown): string | null | undefined => {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return undefined;
  const text = value.trim();
  if (text.length > MAX_TEXT) return undefined;
  return text === "" ? null : text;
};

const PROBLEM_COLUMNS = `order_problems.id, order_problems.order_id, order_problems.fulfilment_method,
  order_problems.reason, order_problems.text, order_problems.status, order_problems.admin_reply,
  order_problems.replied_at, order_problems.resolved_at, order_problems.created_at, order_problems.updated_at`;

export const reportProblem = async (client: PoolClient, restaurantId: number, orderId: number, body: Record<string, unknown>) => {
  const order = await lockOrder(client, orderId);
  if (!order || order.restaurant_id !== restaurantId) throw new HttpError(404, NOT_FOUND);
  const method = order.fulfilment_method as keyof typeof PROBLEM_REASONS;
  const reason = body.reason;
  if (typeof reason !== "string" || !(PROBLEM_REASONS[method] as readonly string[]).includes(reason)) {
    throw new HttpError(400, "Choose a reason.");
  }
  const text = parseText(body.text);
  if (text === undefined) throw new HttpError(400, `Describe the problem (at most ${MAX_TEXT} characters).`);
  // A finished order (its last move to Completed, Rejected or Cancelled) takes reports for 48 hours.
  const window = await client.query<{ open: boolean }>(
    `SELECT orders.status NOT IN ('Completed', 'Rejected', 'Cancelled') OR COALESCE((
       SELECT MAX(order_status_history.created_at) FROM order_status_history
       WHERE order_status_history.order_id = orders.id AND order_status_history.item_id IS NULL
         AND order_status_history.to_status = orders.status::text
     ) > NOW() - INTERVAL '${PROBLEM_REPORT_HOURS} hours', false) AS open
     FROM orders WHERE orders.id = $1`,
    [order.id],
  );
  if (!window.rows[0]!.open) {
    throw new HttpError(400, `A problem can be reported until ${PROBLEM_REPORT_HOURS} hours after the order is finished.`);
  }
  const inserted = await client.query(
    `INSERT INTO order_problems (order_id, reporter_id, fulfilment_method, reason, text)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING ${PROBLEM_COLUMNS}`,
    [order.id, restaurantId, order.fulfilment_method, reason, text],
  );
  await notifyAdminsOfOrderProblem(
    client,
    order.id,
    `A problem was reported with order ${formatOrderCode(order.code)}.`,
    text,
  );
  return inserted.rows[0];
};

const ADMIN_COLUMNS = `${PROBLEM_COLUMNS}, orders.code AS order_code,
  orders.restaurant_id, restaurants.business_name AS restaurant_name, restaurants.email AS restaurant_email,
  orders.store_id, stores.business_name AS store_name, stores.email AS store_email,
  resolvers.email AS resolved_by_email`;

const ADMIN_FROM = `FROM order_problems
  JOIN orders ON orders.id = order_problems.order_id
  JOIN users AS restaurants ON restaurants.id = orders.restaurant_id
  JOIN users AS stores ON stores.id = orders.store_id
  LEFT JOIN users AS resolvers ON resolvers.id = order_problems.resolved_by`;

const isStatus = (value: unknown): value is ProblemStatus =>
  typeof value === "string" && (PROBLEM_STATUSES as readonly string[]).includes(value);

// GET /admin/problems: newest first, paged, optionally one status (empty = all). Null for an
// invalid filter or page.
export const listAdminProblems = async (query: Request["query"]) => {
  const page = parsePage(query, ADMIN_PAGE_SIZE);
  if (!page) return null;
  const values: string[] = [];
  let from = `${ADMIN_FROM} WHERE true`;
  if (query.status !== undefined && query.status !== "") {
    if (!isStatus(query.status)) return null;
    values.push(query.status);
    from += ` AND order_problems.status = $${values.length}`;
  }
  const { rows, total } = await listPage(
    ADMIN_COLUMNS,
    from,
    "order_problems.created_at DESC, order_problems.id DESC",
    values,
    page,
  );
  return { problems: rows, total };
};

// PATCH /admin/problems/:id: a new status and/or a reply. RESOLVED records who resolved it and when
// (reopening clears it); a new reply records its time. The restaurant gets ORDER_PROBLEM_RESOLVED
// when the report becomes resolved, otherwise ORDER_PROBLEM_REPLIED for a new reply (the reply as
// the details); a status change alone tells it nothing. Returns the report as the admin list
// shows it and the order's restaurant (for the audit log).
export const updateProblem = async (client: PoolClient, adminId: number, problemId: number, body: Record<string, unknown>) => {
  const status = body.status;
  if (status !== undefined && !isStatus(status)) throw new HttpError(400, "Status is not valid.");
  const reply = body.reply === undefined ? undefined : parseText(body.reply);
  if (body.reply !== undefined && reply === undefined) {
    throw new HttpError(400, `The reply can be at most ${MAX_TEXT} characters long.`);
  }
  if (status === undefined && reply === undefined) throw new HttpError(400, "Choose a status or write a reply.");

  const current = (
    await client.query<{ id: number; status: ProblemStatus; admin_reply: string | null; order_id: number }>(
      `SELECT order_problems.id, order_problems.status, order_problems.admin_reply, order_problems.order_id
       FROM order_problems WHERE order_problems.id = $1 FOR UPDATE`,
      [problemId],
    )
  ).rows[0];
  if (!current) throw new HttpError(404, "Problem report not found.");

  const nextStatus = status ?? current.status;
  const newReply = reply !== undefined && reply !== null && reply !== current.admin_reply;
  const nowResolved = nextStatus === "RESOLVED" && current.status !== "RESOLVED";
  await client.query(
    `UPDATE order_problems SET
       status = $2::order_problem_status,
       admin_reply = CASE WHEN $3::boolean THEN $4::varchar ELSE order_problems.admin_reply END,
       replied_at = CASE WHEN $3::boolean THEN NOW() ELSE order_problems.replied_at END,
       resolved_by = CASE WHEN $2::text = 'RESOLVED' THEN CASE WHEN $5::boolean THEN $6::int ELSE order_problems.resolved_by END END,
       resolved_at = CASE WHEN $2::text = 'RESOLVED' THEN CASE WHEN $5::boolean THEN NOW() ELSE order_problems.resolved_at END END
     WHERE order_problems.id = $1`,
    [problemId, nextStatus, newReply, reply ?? null, nowResolved, adminId],
  );
  const updated = (
    await client.query(`SELECT ${ADMIN_COLUMNS} ${ADMIN_FROM} WHERE order_problems.id = $1`, [problemId])
  ).rows[0];
  const code = formatOrderCode(updated.order_code);
  if (nowResolved || newReply) {
    await createNotification(client, {
      userId: updated.restaurant_id,
      orderId: updated.order_id,
      type: nowResolved ? "ORDER_PROBLEM_RESOLVED" : "ORDER_PROBLEM_REPLIED",
      message: nowResolved
        ? `Your problem report for order ${code} was resolved.`
        : `Your problem report for order ${code} got a reply.`,
      details: updated.admin_reply,
    });
  }
  return updated;
};
