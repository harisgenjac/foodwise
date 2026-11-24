import type { MigrationBuilder } from "node-pg-migrate";

// Data for the restaurant's order page (docs/backend.md, Delivery provider and Orders):
// - deliveries: the courier as the delivery service reports it (its id, photo and vehicle) and the
//   failure as a code next to the provider's text. Existing failures reported by the provider get
//   OTHER (or CANCELLED_BY_SERVICE for a cancel on its side); a delivery that could not be created
//   or an admin's cancel keeps its own code in failure_reason only.
// - delivery_events: the estimates each event carried (the history of estimate changes) and its
//   failure code.
// - orders.switched_to_pickup_at: when the restaurant picked a failed delivery order up itself
//   instead (existing ones take the delivery's failure time, the closest known moment).
// - order_problems: a restaurant's problem reports, handled by an admin.
// - courier_ratings: a restaurant's rating of the courier of a delivered order, sent on to the
//   delivery service (sent_at, or last_error and a retry).
// Both new tables notify the order's live events, so an open order page refreshes.
export const up = (pgm: MigrationBuilder) => {
  pgm.sql(`
    ALTER TYPE admin_action_type ADD VALUE IF NOT EXISTS 'UPDATE_ORDER_PROBLEM';

    ALTER TABLE deliveries
      ADD COLUMN courier_id character varying(100),
      ADD COLUMN courier_photo_url text,
      ADD COLUMN courier_vehicle character varying(10),
      ADD COLUMN failure_code character varying(30),
      ADD CONSTRAINT deliveries_courier_vehicle_check CHECK (courier_vehicle IN ('BICYCLE', 'SCOOTER', 'CAR')),
      ADD CONSTRAINT deliveries_failure_code_check
        CHECK (failure_code IN ('NO_COURIER', 'OUT_OF_ZONE', 'CANCELLED_BY_SERVICE', 'RECIPIENT_CLOSED', 'OTHER'));

    UPDATE deliveries SET failure_code = CASE WHEN deliveries.status = 'CANCELLED' THEN 'CANCELLED_BY_SERVICE' ELSE 'OTHER' END
    WHERE deliveries.provider_delivery_id IS NOT NULL
      AND deliveries.status IN ('FAILED', 'CANCELLED')
      AND deliveries.failure_reason IS DISTINCT FROM 'CANCELLED_BY_ADMIN';

    ALTER TABLE delivery_events
      ADD COLUMN estimated_pickup_at timestamp with time zone,
      ADD COLUMN estimated_delivery_at timestamp with time zone,
      ADD COLUMN failure_code character varying(30);

    ALTER TABLE orders ADD COLUMN switched_to_pickup_at timestamp with time zone;

    UPDATE orders SET switched_to_pickup_at = COALESCE(deliveries.failed_at, deliveries.updated_at)
    FROM deliveries
    WHERE deliveries.order_id = orders.id AND orders.fulfilment_method = 'PICKUP';

    CREATE TYPE order_problem_status AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED');

    CREATE TABLE order_problems (
      id serial PRIMARY KEY,
      order_id integer NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      reporter_id integer REFERENCES users(id) ON DELETE SET NULL,
      fulfilment_method fulfilment_method NOT NULL,
      reason character varying(20) NOT NULL,
      text character varying(1000),
      status order_problem_status DEFAULT 'OPEN' NOT NULL,
      admin_reply character varying(1000),
      replied_at timestamp with time zone,
      resolved_by integer REFERENCES users(id) ON DELETE SET NULL,
      resolved_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT order_problems_reason_matches_method CHECK (
        (fulfilment_method = 'DELIVERY' AND reason IN ('LATE', 'MISSING_ITEM', 'DAMAGED', 'COURIER', 'PAYMENT', 'OTHER'))
        OR (fulfilment_method = 'PICKUP' AND reason IN ('PICKUP_TIME', 'MISSING_ITEM', 'DAMAGED', 'STORE', 'OTHER'))
      )
    );
    CREATE INDEX order_problems_order_id_index ON order_problems (order_id);
    CREATE INDEX order_problems_status_created_at_index ON order_problems (status, created_at);
    CREATE TRIGGER set_order_problems_updated_at BEFORE UPDATE ON order_problems
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
    CREATE TRIGGER order_problems_live_event AFTER INSERT OR UPDATE ON order_problems
      FOR EACH ROW EXECUTE FUNCTION notify_order_change();

    CREATE TABLE courier_ratings (
      id serial PRIMARY KEY,
      order_id integer NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
      delivery_id integer NOT NULL REFERENCES deliveries(id) ON DELETE CASCADE,
      restaurant_id integer REFERENCES users(id) ON DELETE SET NULL,
      provider character varying(20) NOT NULL,
      courier_id character varying(100),
      courier_name character varying(100),
      rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
      comment character varying(500),
      created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      sent_at timestamp with time zone,
      attempts integer DEFAULT 0 NOT NULL,
      last_error text
    );
    CREATE INDEX courier_ratings_unsent_index ON courier_ratings (created_at) WHERE sent_at IS NULL;
    CREATE TRIGGER courier_ratings_live_event AFTER INSERT OR UPDATE ON courier_ratings
      FOR EACH ROW EXECUTE FUNCTION notify_order_change();
  `);
};

// The admin_action_type value stays (Postgres cannot drop an enum value).
export const down = (pgm: MigrationBuilder) => {
  pgm.sql(`
    DROP TABLE courier_ratings;
    DROP TABLE order_problems;
    DROP TYPE order_problem_status;
    ALTER TABLE orders DROP COLUMN switched_to_pickup_at;
    ALTER TABLE delivery_events DROP COLUMN estimated_pickup_at, DROP COLUMN estimated_delivery_at, DROP COLUMN failure_code;
    ALTER TABLE deliveries
      DROP COLUMN courier_id, DROP COLUMN courier_photo_url, DROP COLUMN courier_vehicle, DROP COLUMN failure_code;
  `);
};
