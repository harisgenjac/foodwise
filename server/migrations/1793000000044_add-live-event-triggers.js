/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// Delivery phase 2, SSE: live updates on the order pages and the notification bell.
// Triggers send a NOTIFY on the `live_events` channel whenever an order, one of its items or its
// delivery changes, and whenever a notification is inserted. Postgres delivers a NOTIFY only when
// its transaction commits (never after a rollback), and only once for identical payloads within
// one transaction, so a decision that touches many items of one order sends one event. The
// server's listener (src/live/listener.ts) passes each event to the open streams of the users in
// `user_ids`. The payload says only what changed, never its content: the page loads that through
// the API, which checks access as usual.
/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.sql(`
    CREATE FUNCTION notify_order_change() RETURNS trigger AS $$
    DECLARE
      changed_order integer;
      parties record;
    BEGIN
      IF TG_TABLE_NAME = 'orders' THEN
        changed_order := NEW.id;
      ELSE
        changed_order := NEW.order_id;
      END IF;
      SELECT orders.store_id, orders.restaurant_id INTO parties FROM orders WHERE orders.id = changed_order;
      IF FOUND THEN
        PERFORM pg_notify('live_events', json_build_object(
          'kind', 'order',
          'order_id', changed_order,
          'user_ids', json_build_array(parties.store_id, parties.restaurant_id)
        )::text);
      END IF;
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER orders_live_event AFTER INSERT OR UPDATE ON orders
      FOR EACH ROW EXECUTE FUNCTION notify_order_change();
    CREATE TRIGGER order_items_live_event AFTER INSERT OR UPDATE ON order_items
      FOR EACH ROW EXECUTE FUNCTION notify_order_change();
    CREATE TRIGGER deliveries_live_event AFTER INSERT OR UPDATE ON deliveries
      FOR EACH ROW EXECUTE FUNCTION notify_order_change();

    CREATE FUNCTION notify_new_notification() RETURNS trigger AS $$
    BEGIN
      PERFORM pg_notify('live_events', json_build_object(
        'kind', 'notification',
        'user_ids', json_build_array(NEW.user_id)
      )::text);
      RETURN NULL;
    END;
    $$ LANGUAGE plpgsql;

    CREATE TRIGGER notifications_live_event AFTER INSERT ON notifications
      FOR EACH ROW EXECUTE FUNCTION notify_new_notification();
  `);
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.sql(`
    DROP TRIGGER notifications_live_event ON notifications;
    DROP TRIGGER deliveries_live_event ON deliveries;
    DROP TRIGGER order_items_live_event ON order_items;
    DROP TRIGGER orders_live_event ON orders;
    DROP FUNCTION notify_new_notification();
    DROP FUNCTION notify_order_change();
  `);
};
