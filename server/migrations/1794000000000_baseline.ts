import type { MigrationBuilder } from "node-pg-migrate";

// The baseline: the whole schema as it stood after the cleanup of Nov 18, 2026, created directly.
// It replaced the 54 migrations written while the app was built (squashed: the app was not live
// and its data was test data only). Every enum is complete from the start, nothing is backfilled
// and nothing runs outside the transaction.
//
// Order: the enums, the tables (primary keys, unique and check constraints inline), the functions
// (city_distance_km reads cities, so it comes after the tables), the foreign keys, the indexes,
// the triggers, then the reference data production needs: the cities with their coordinates, the
// credit plans and the top-up packages. New schema changes go in new migrations
// (npm run migrate:create -- <name>).

// Enums.
const TYPES = String.raw`
  CREATE TYPE admin_action_type AS ENUM (
      'CREATE_USER',
      'RESET_PASSWORD',
      'BLOCK_USER',
      'UNBLOCK_USER',
      'REMOVE_PRODUCT',
      'REMOVE_DONATION',
      'UPDATE_PROFILE',
      'CREATE_ANNOUNCEMENT',
      'END_ANNOUNCEMENT',
      'APPROVE_CREDIT_REQUEST',
      'REJECT_CREDIT_REQUEST',
      'ADJUST_CREDITS',
      'CREATE_COMPANY',
      'UPDATE_COMPANY',
      'BLOCK_COMPANY',
      'UNBLOCK_COMPANY',
      'DEACTIVATE_BRANCH',
      'REACTIVATE_BRANCH',
      'ATTACH_BRANCH',
      'SEND_INVITATION',
      'RESEND_INVITATION',
      'SEND_PASSWORD_RESET_LINK',
      'CANCEL_ORDER'
  );

  CREATE TYPE announcement_audience AS ENUM (
      'ALL',
      'STORE',
      'RESTAURANT'
  );

  CREATE TYPE credit_actor AS ENUM (
      'USER',
      'ADMIN',
      'SYSTEM'
  );

  CREATE TYPE credit_request_source AS ENUM (
      'USER',
      'AUTO_RENEW',
      'COMPANY',
      'BRANCH'
  );

  CREATE TYPE credit_request_status AS ENUM (
      'PENDING',
      'APPROVED',
      'REJECTED',
      'CANCELLED',
      'EXPIRED',
      'COMPANY_REVIEW',
      'COMPANY_REJECTED'
  );

  CREATE TYPE credit_request_type AS ENUM (
      'SUBSCRIPTION',
      'TOPUP'
  );

  CREATE TYPE credit_transaction_type AS ENUM (
      'PLAN_GRANT',
      'TOPUP_GRANT',
      'ADMIN_ADJUSTMENT',
      'PRODUCT_CHARGE',
      'PRODUCT_REFUND'
  );

  CREATE TYPE delivery_status AS ENUM (
      'CREATED',
      'COURIER_ASSIGNED',
      'PICKED_UP',
      'DELIVERED',
      'FAILED',
      'CANCELLED'
  );

  CREATE TYPE donation_status AS ENUM (
      'Available',
      'Expired',
      'Removed'
  );

  CREATE TYPE donation_type AS ENUM (
      'FREE',
      'SPONSORED'
  );

  CREATE TYPE fulfilment_method AS ENUM (
      'PICKUP',
      'DELIVERY'
  );

  CREATE TYPE order_change_reason AS ENUM (
      'NOT_ENOUGH_STOCK',
      'QUALITY',
      'OTHER'
  );

  CREATE TYPE order_event_source AS ENUM (
      'RESTAURANT',
      'STORE',
      'ADMIN',
      'SYSTEM',
      'PROVIDER'
  );

  CREATE TYPE order_item_status AS ENUM (
      'Pending',
      'Confirmed',
      'InDelivery',
      'Completed',
      'Rejected',
      'Cancelled'
  );

  CREATE TYPE order_status AS ENUM (
      'Pending',
      'Confirmed',
      'InDelivery',
      'Completed',
      'Rejected',
      'Cancelled'
  );

  CREATE TYPE product_status AS ENUM (
      'Available',
      'Sold',
      'Expired',
      'Removed'
  );

  CREATE TYPE subscription_status AS ENUM (
      'ACTIVE',
      'CANCELLED'
  );

  CREATE TYPE user_role AS ENUM (
      'STORE',
      'RESTAURANT',
      'ADMIN',
      'COMPANY'
  );
`;

// Tables.
const TABLES = String.raw`
  CREATE TABLE account_events (
      id serial,
      user_id integer NOT NULL,
      event character varying(40) NOT NULL,
      ip character varying(64),
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT account_events_event_check CHECK (event IN ('PASSWORD_RESET_REQUESTED', 'PASSWORD_RESET', 'INVITATION_ACCEPTED')),
      CONSTRAINT account_events_pkey PRIMARY KEY (id)
  );

  CREATE TABLE admin_actions (
      id serial,
      admin_id integer NOT NULL,
      action admin_action_type NOT NULL,
      target_user_id integer,
      target_product_id integer,
      target_donation_id integer,
      reason text,
      created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      target_announcement_id integer,
      target_credit_request_id integer,
      target_company_id integer,
      target_order_id integer,
      CONSTRAINT admin_actions_pkey PRIMARY KEY (id)
  );

  CREATE TABLE announcement_dismissals (
      announcement_id integer NOT NULL,
      user_id integer NOT NULL,
      dismissed_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT announcement_dismissals_pkey PRIMARY KEY (announcement_id, user_id)
  );

  CREATE TABLE announcements (
      id serial,
      admin_id integer NOT NULL,
      audience announcement_audience NOT NULL,
      title_bs character varying(120) NOT NULL,
      body_bs text NOT NULL,
      title_en character varying(120),
      body_en text,
      expires_at timestamp with time zone,
      ended_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT announcements_pkey PRIMARY KEY (id)
  );

  CREATE TABLE auth_tokens (
      id serial,
      user_id integer NOT NULL,
      purpose character varying(32) NOT NULL,
      token_hash character(64) NOT NULL,
      expires_at timestamp with time zone NOT NULL,
      used_at timestamp with time zone,
      revoked_at timestamp with time zone,
      created_by integer,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT auth_tokens_purpose_check CHECK (purpose IN ('PASSWORD_RESET', 'INVITATION')),
      CONSTRAINT auth_tokens_pkey PRIMARY KEY (id),
      CONSTRAINT auth_tokens_token_hash_key UNIQUE (token_hash)
  );

  CREATE TABLE cart_items (
      restaurant_id integer NOT NULL,
      product_id integer NOT NULL,
      quantity numeric NOT NULL,
      unit_price_seen numeric NOT NULL,
      added_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT cart_items_quantity_check CHECK ((quantity > (0)::numeric)),
      CONSTRAINT cart_items_unit_price_seen_check CHECK ((unit_price_seen >= (0)::numeric)),
      CONSTRAINT cart_items_pkey PRIMARY KEY (restaurant_id, product_id)
  );

  CREATE TABLE cities (
      id serial,
      name character varying(100) NOT NULL,
      latitude numeric(9,6) NOT NULL,
      longitude numeric(9,6) NOT NULL,
      created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT cities_name_key UNIQUE (name),
      CONSTRAINT cities_pkey PRIMARY KEY (id)
  );

  CREATE TABLE companies (
      id serial,
      name character varying(120) NOT NULL,
      description text,
      logo_url character varying(255),
      is_blocked boolean DEFAULT false NOT NULL,
      blocked_at timestamp with time zone,
      blocked_reason text,
      created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT companies_pkey PRIMARY KEY (id)
  );

  CREATE TABLE credit_requests (
      id serial,
      user_id integer NOT NULL,
      request_type credit_request_type NOT NULL,
      plan_id integer,
      topup_package_id integer,
      period_month date NOT NULL,
      auto_renew boolean DEFAULT false NOT NULL,
      status credit_request_status DEFAULT 'PENDING'::credit_request_status NOT NULL,
      admin_note text,
      created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      reviewed_by integer,
      reviewed_at timestamp with time zone,
      source credit_request_source DEFAULT 'USER'::credit_request_source NOT NULL,
      credits integer NOT NULL,
      price numeric(10,2) NOT NULL,
      requested_by integer,
      company_note text,
      company_reviewed_by integer,
      company_reviewed_at timestamp with time zone,
      CONSTRAINT credit_request_target_matches_type CHECK ((((request_type = 'SUBSCRIPTION'::credit_request_type) AND (plan_id IS NOT NULL) AND (topup_package_id IS NULL)) OR ((request_type = 'TOPUP'::credit_request_type) AND (topup_package_id IS NOT NULL) AND (plan_id IS NULL)))),
      CONSTRAINT credit_requests_credits_check CHECK ((credits > 0)),
      CONSTRAINT credit_requests_period_month_check CHECK ((EXTRACT(day FROM period_month) = (1)::numeric)),
      CONSTRAINT credit_requests_price_check CHECK ((price >= (0)::numeric)),
      CONSTRAINT credit_requests_pkey PRIMARY KEY (id)
  );

  CREATE TABLE credit_transactions (
      id serial,
      user_id integer NOT NULL,
      subscription_id integer,
      period_month date NOT NULL,
      amount integer NOT NULL,
      type credit_transaction_type NOT NULL,
      reason text,
      related_entity_type character varying(20),
      related_entity_id integer,
      category character varying(50),
      refunds_transaction_id integer,
      actor credit_actor NOT NULL,
      created_by_user_id integer,
      created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT credit_amount_matches_type CHECK ((((type = ANY (ARRAY['PLAN_GRANT'::credit_transaction_type, 'TOPUP_GRANT'::credit_transaction_type, 'PRODUCT_REFUND'::credit_transaction_type])) AND (amount > 0)) OR ((type = 'PRODUCT_CHARGE'::credit_transaction_type) AND (amount < 0)) OR ((type = 'ADMIN_ADJUSTMENT'::credit_transaction_type) AND (amount <> 0)))),
      CONSTRAINT credit_refund_has_charge CHECK (((type = 'PRODUCT_REFUND'::credit_transaction_type) = (refunds_transaction_id IS NOT NULL))),
      CONSTRAINT credit_transactions_period_month_check CHECK ((EXTRACT(day FROM period_month) = (1)::numeric)),
      CONSTRAINT credit_transactions_related_entity_type_check CHECK (related_entity_type IN ('product', 'credit_request')),
      CONSTRAINT credit_transactions_pkey PRIMARY KEY (id),
      CONSTRAINT credit_transactions_refunds_transaction_id_key UNIQUE (refunds_transaction_id)
  );

  CREATE TABLE deliveries (
      id serial,
      order_id integer NOT NULL,
      provider character varying(20) NOT NULL,
      provider_delivery_id character varying(100),
      status delivery_status NOT NULL,
      price numeric(10,2),
      cash_to_collect numeric(10,2),
      ready_at timestamp with time zone NOT NULL,
      estimated_pickup_at timestamp with time zone,
      estimated_delivery_at timestamp with time zone,
      courier_name character varying(100),
      courier_phone character varying(40),
      tracking_url text,
      failure_reason text,
      created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      picked_up_at timestamp with time zone,
      delivered_at timestamp with time zone,
      CONSTRAINT deliveries_created_has_provider_data CHECK (((status = 'FAILED'::delivery_status) OR ((provider_delivery_id IS NOT NULL) AND (price IS NOT NULL) AND (cash_to_collect IS NOT NULL)))),
      CONSTRAINT deliveries_order_id_key UNIQUE (order_id),
      CONSTRAINT deliveries_pkey PRIMARY KEY (id),
      CONSTRAINT deliveries_provider_id_unique UNIQUE (provider, provider_delivery_id)
  );

  CREATE TABLE delivery_events (
      id serial,
      delivery_id integer NOT NULL,
      provider character varying(20) NOT NULL,
      event_id character varying(100) NOT NULL,
      type character varying(40) NOT NULL,
      occurred_at timestamp with time zone NOT NULL,
      applied boolean NOT NULL,
      received_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT delivery_events_event_unique UNIQUE (provider, event_id),
      CONSTRAINT delivery_events_pkey PRIMARY KEY (id)
  );

  CREATE TABLE donation_offers (
      id serial,
      donor_id integer NOT NULL,
      source_product_id integer,
      donation_type donation_type NOT NULL,
      name character varying(255) NOT NULL,
      description text,
      category character varying(100) NOT NULL,
      quantity numeric NOT NULL,
      unit character varying(50) NOT NULL,
      original_price numeric NOT NULL,
      donation_price numeric,
      expiry_date date NOT NULL,
      pickup_from time without time zone,
      pickup_until time without time zone,
      allergens text[] DEFAULT '{}'::text[] NOT NULL,
      serving_temperature character varying(20),
      status donation_status DEFAULT 'Available'::donation_status NOT NULL,
      created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT donation_price_matches_type CHECK ((((donation_type = 'FREE'::donation_type) AND (donation_price IS NULL)) OR ((donation_type = 'SPONSORED'::donation_type) AND (donation_price > (0)::numeric)))),
      CONSTRAINT donation_offers_pkey PRIMARY KEY (id)
  );

  CREATE TABLE email_queue (
      id serial,
      user_id integer,
      recipient character varying(254) NOT NULL,
      template character varying(64) NOT NULL,
      data jsonb DEFAULT '{}'::jsonb NOT NULL,
      language character varying(2) DEFAULT 'bs'::character varying NOT NULL,
      status character varying(16) DEFAULT 'PENDING'::character varying NOT NULL,
      attempts integer DEFAULT 0 NOT NULL,
      next_attempt_at timestamp with time zone DEFAULT now() NOT NULL,
      locked_at timestamp with time zone,
      last_error text,
      sent_at timestamp with time zone,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      updated_at timestamp with time zone DEFAULT now() NOT NULL,
      CONSTRAINT email_queue_attempts_check CHECK ((attempts >= 0)),
      CONSTRAINT email_queue_language_check CHECK (language IN ('bs', 'en')),
      CONSTRAINT email_queue_status_check CHECK (status IN ('PENDING', 'SENDING', 'SENT', 'FAILED', 'SKIPPED')),
      CONSTRAINT email_queue_pkey PRIMARY KEY (id)
  );

  CREATE TABLE favorites (
      id serial,
      restaurant_id integer NOT NULL,
      store_id integer NOT NULL,
      created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT favorites_pkey PRIMARY KEY (id),
      CONSTRAINT unique_restaurant_store UNIQUE (restaurant_id, store_id)
  );

  CREATE TABLE notifications (
      id serial,
      user_id integer NOT NULL,
      message text NOT NULL,
      is_read boolean DEFAULT false NOT NULL,
      created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      type character varying(40),
      product_id integer,
      donation_id integer,
      details text,
      announcement_id integer,
      credit_request_id integer,
      branch_id integer,
      order_id integer,
      CONSTRAINT notifications_pkey PRIMARY KEY (id)
  );

  CREATE TABLE order_items (
      id serial,
      product_id integer NOT NULL,
      restaurant_id integer NOT NULL,
      quantity numeric NOT NULL,
      status order_item_status DEFAULT 'Pending'::order_item_status NOT NULL,
      created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      unit_price numeric NOT NULL,
      picked_up_at timestamp with time zone,
      order_id integer NOT NULL,
      ordered_quantity numeric NOT NULL,
      decided_at timestamp with time zone,
      change_reason order_change_reason,
      change_note character varying(300),
      CONSTRAINT order_items_other_reason_has_note CHECK (((change_reason IS DISTINCT FROM 'OTHER'::order_change_reason) OR ((change_note IS NOT NULL) AND (btrim((change_note)::text) <> ''::text)))),
      CONSTRAINT order_items_quantity_within_ordered CHECK ((quantity <= ordered_quantity)),
      CONSTRAINT order_items_order_product_unique UNIQUE (order_id, product_id),
      CONSTRAINT order_items_pkey PRIMARY KEY (id)
  );

  CREATE TABLE order_status_history (
      id serial,
      order_id integer NOT NULL,
      item_id integer,
      from_status character varying(20),
      to_status character varying(20) NOT NULL,
      source order_event_source NOT NULL,
      actor_id integer,
      reason text,
      created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT order_status_history_pkey PRIMARY KEY (id)
  );

  CREATE TABLE orders (
      id serial,
      store_id integer NOT NULL,
      restaurant_id integer NOT NULL,
      code character(4) NOT NULL,
      status order_status DEFAULT 'Pending'::order_status NOT NULL,
      fulfilment_method fulfilment_method DEFAULT 'PICKUP'::fulfilment_method NOT NULL,
      pickup_at timestamp without time zone,
      accept_partial boolean DEFAULT true NOT NULL,
      decided_at timestamp with time zone,
      send_changes jsonb DEFAULT '[]'::jsonb NOT NULL,
      picked_up_at timestamp with time zone,
      created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      delivery_address text,
      delivery_latitude double precision,
      delivery_longitude double precision,
      delivery_fee_estimate numeric(10,2),
      delivery_estimated_at timestamp with time zone,
      ready_at timestamp with time zone,
      CONSTRAINT orders_delivery_needs_address CHECK (((fulfilment_method <> 'DELIVERY'::fulfilment_method) OR ((pickup_at IS NOT NULL) AND (delivery_address IS NOT NULL) AND (delivery_latitude IS NOT NULL) AND (delivery_longitude IS NOT NULL) AND (delivery_fee_estimate IS NOT NULL) AND (delivery_estimated_at IS NOT NULL)))),
      CONSTRAINT orders_pickup_needs_time CHECK (((fulfilment_method <> 'PICKUP'::fulfilment_method) OR (pickup_at IS NOT NULL))),
      CONSTRAINT orders_pkey PRIMARY KEY (id),
      CONSTRAINT orders_store_code_unique UNIQUE (store_id, code)
  );

  CREATE TABLE plans (
      id serial,
      name character varying(50) NOT NULL,
      credits_per_period integer NOT NULL,
      price numeric(10,2) NOT NULL,
      is_active boolean DEFAULT true NOT NULL,
      created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT plans_credits_per_period_check CHECK ((credits_per_period > 0)),
      CONSTRAINT plans_price_check CHECK ((price >= (0)::numeric)),
      CONSTRAINT plans_name_key UNIQUE (name),
      CONSTRAINT plans_pkey PRIMARY KEY (id)
  );

  CREATE TABLE product_shop_sales (
      id serial,
      product_id integer NOT NULL,
      store_id integer NOT NULL,
      quantity numeric NOT NULL,
      created_by integer,
      created_at timestamp with time zone DEFAULT now() NOT NULL,
      order_id integer,
      CONSTRAINT product_shop_sales_quantity_check CHECK ((quantity > (0)::numeric)),
      CONSTRAINT product_shop_sales_pkey PRIMARY KEY (id)
  );

  CREATE TABLE product_templates (
      id serial,
      store_id integer NOT NULL,
      name character varying(255) NOT NULL,
      description text,
      category character varying(100) NOT NULL,
      unit character varying(50) NOT NULL,
      original_price numeric,
      discounted_price numeric,
      quantity numeric,
      shelf_life_days integer,
      created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      image_url text,
      CONSTRAINT product_templates_pkey PRIMARY KEY (id),
      CONSTRAINT unique_store_template_name UNIQUE (store_id, name)
  );

  CREATE TABLE products (
      id serial,
      store_id integer NOT NULL,
      name character varying(255) NOT NULL,
      description text,
      category character varying(100) NOT NULL,
      original_price numeric NOT NULL,
      discounted_price numeric NOT NULL,
      quantity numeric NOT NULL,
      unit character varying(50) NOT NULL,
      expiry_date date NOT NULL,
      status product_status DEFAULT 'Available'::product_status NOT NULL,
      created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      shop_shortage numeric DEFAULT 0 NOT NULL,
      image_url text,
      CONSTRAINT products_shop_shortage_check CHECK ((shop_shortage >= (0)::numeric)),
      CONSTRAINT products_pkey PRIMARY KEY (id)
  );

  CREATE TABLE subscriptions (
      id serial,
      user_id integer NOT NULL,
      plan_id integer NOT NULL,
      credit_request_id integer,
      period_month date NOT NULL,
      status subscription_status DEFAULT 'ACTIVE'::subscription_status NOT NULL,
      auto_renew boolean DEFAULT false NOT NULL,
      created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT subscriptions_period_month_check CHECK ((EXTRACT(day FROM period_month) = (1)::numeric)),
      CONSTRAINT subscriptions_pkey PRIMARY KEY (id),
      CONSTRAINT unique_user_period UNIQUE (user_id, period_month)
  );

  CREATE TABLE topup_packages (
      id serial,
      credits integer NOT NULL,
      price numeric(10,2) NOT NULL,
      is_active boolean DEFAULT true NOT NULL,
      created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      CONSTRAINT topup_packages_credits_check CHECK ((credits > 0)),
      CONSTRAINT topup_packages_price_check CHECK ((price >= (0)::numeric)),
      CONSTRAINT topup_packages_credits_key UNIQUE (credits),
      CONSTRAINT topup_packages_pkey PRIMARY KEY (id)
  );

  CREATE TABLE users (
      id serial,
      first_name character varying(100),
      last_name character varying(100),
      email character varying(255) NOT NULL,
      password_hash character varying(255) NOT NULL,
      role user_role NOT NULL,
      business_name character varying(255),
      logo_url text,
      address character varying(255),
      description text,
      phone character varying(50),
      created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP NOT NULL,
      is_blocked boolean DEFAULT false NOT NULL,
      blocked_at timestamp without time zone,
      blocked_reason text,
      must_change_password boolean DEFAULT false NOT NULL,
      city_id integer,
      company_id integer,
      deactivated_at timestamp with time zone,
      deactivated_by integer,
      email_notifications boolean DEFAULT true NOT NULL,
      session_version integer DEFAULT 0 NOT NULL,
      last_login_at timestamp with time zone,
      cover_url text,
      opening_schedule jsonb,
      pickup_schedule jsonb,
      latitude double precision,
      longitude double precision,
      delivery_enabled boolean DEFAULT true NOT NULL,
      preparation_minutes smallint DEFAULT 30 NOT NULL,
      orders_paused boolean DEFAULT false NOT NULL,
      orders_paused_until timestamp with time zone,
      CONSTRAINT users_company_matches_role CHECK ((((role = 'COMPANY'::user_role) AND (company_id IS NOT NULL)) OR (role = 'STORE'::user_role) OR ((role = ANY (ARRAY['ADMIN'::user_role, 'RESTAURANT'::user_role])) AND (company_id IS NULL)))),
      CONSTRAINT users_location_valid CHECK ((latitude IS NULL AND longitude IS NULL) OR (latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180)),
      CONSTRAINT users_orders_pause_valid CHECK (((orders_paused_until IS NULL) OR orders_paused)),
      CONSTRAINT users_preparation_minutes_valid CHECK ((preparation_minutes = ANY (ARRAY[15, 30, 45, 60, 90, 120]))),
      CONSTRAINT users_email_key UNIQUE (email),
      CONSTRAINT users_pkey PRIMARY KEY (id)
  );
`;

// Functions: updated_at, the append-only credit ledger, the credit request snapshot, city distances
// and the live event notifications (LISTEN live_events, src/live/listener.ts). Not indented: pg keeps
// each body exactly as written.
const FUNCTIONS = String.raw`
CREATE FUNCTION city_distance_km(from_city integer, to_city integer) RETURNS integer
    LANGUAGE sql STABLE
    AS $$
      SELECT ROUND(
        2 * 6371 * ASIN(LEAST(1, SQRT(
          POWER(SIN(RADIANS(to_cities.latitude::float8 - from_cities.latitude::float8) / 2), 2)
          + COS(RADIANS(from_cities.latitude::float8)) * COS(RADIANS(to_cities.latitude::float8))
            * POWER(SIN(RADIANS(to_cities.longitude::float8 - from_cities.longitude::float8) / 2), 2)
        )))
      )::integer
      FROM cities AS from_cities, cities AS to_cities
      WHERE from_cities.id = from_city AND to_cities.id = to_city
    $$;

CREATE FUNCTION notify_new_notification() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      PERFORM pg_notify('live_events', json_build_object(
        'kind', 'notification',
        'user_ids', json_build_array(NEW.user_id)
      )::text);
      RETURN NULL;
    END;
    $$;

CREATE FUNCTION notify_order_change() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
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
    $$;

CREATE FUNCTION protect_credit_ledger() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF TG_OP = 'DELETE' AND current_setting('app.ledger_maintenance', true) = 'on' THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'credit_transactions is append-only';
    END;
    $$;

CREATE FUNCTION set_updated_at() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
        BEGIN
          NEW.updated_at = current_timestamp;
          RETURN NEW;
        END;
        $$;

CREATE FUNCTION snapshot_credit_request() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
    BEGIN
      IF NEW.credits IS NULL OR NEW.price IS NULL THEN
        IF NEW.plan_id IS NOT NULL THEN
          SELECT COALESCE(NEW.credits, plans.credits_per_period), COALESCE(NEW.price, plans.price)
          INTO NEW.credits, NEW.price
          FROM plans WHERE plans.id = NEW.plan_id;
        ELSE
          SELECT COALESCE(NEW.credits, topup_packages.credits), COALESCE(NEW.price, topup_packages.price)
          INTO NEW.credits, NEW.price
          FROM topup_packages WHERE topup_packages.id = NEW.topup_package_id;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $$;
`;

// Foreign keys.
const FOREIGN_KEYS = String.raw`
  ALTER TABLE ONLY account_events
      ADD CONSTRAINT account_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

  ALTER TABLE ONLY admin_actions
      ADD CONSTRAINT admin_actions_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE RESTRICT;

  ALTER TABLE ONLY admin_actions
      ADD CONSTRAINT admin_actions_target_announcement_id_fkey FOREIGN KEY (target_announcement_id) REFERENCES announcements(id) ON DELETE SET NULL;

  ALTER TABLE ONLY admin_actions
      ADD CONSTRAINT admin_actions_target_company_id_fkey FOREIGN KEY (target_company_id) REFERENCES companies(id) ON DELETE SET NULL;

  ALTER TABLE ONLY admin_actions
      ADD CONSTRAINT admin_actions_target_credit_request_id_fkey FOREIGN KEY (target_credit_request_id) REFERENCES credit_requests(id) ON DELETE SET NULL;

  ALTER TABLE ONLY admin_actions
      ADD CONSTRAINT admin_actions_target_donation_id_fkey FOREIGN KEY (target_donation_id) REFERENCES donation_offers(id) ON DELETE SET NULL;

  ALTER TABLE ONLY admin_actions
      ADD CONSTRAINT admin_actions_target_order_id_fkey FOREIGN KEY (target_order_id) REFERENCES orders(id) ON DELETE SET NULL;

  ALTER TABLE ONLY admin_actions
      ADD CONSTRAINT admin_actions_target_product_id_fkey FOREIGN KEY (target_product_id) REFERENCES products(id) ON DELETE SET NULL;

  ALTER TABLE ONLY admin_actions
      ADD CONSTRAINT admin_actions_target_user_id_fkey FOREIGN KEY (target_user_id) REFERENCES users(id) ON DELETE SET NULL;

  ALTER TABLE ONLY announcement_dismissals
      ADD CONSTRAINT announcement_dismissals_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE CASCADE;

  ALTER TABLE ONLY announcement_dismissals
      ADD CONSTRAINT announcement_dismissals_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

  ALTER TABLE ONLY announcements
      ADD CONSTRAINT announcements_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE RESTRICT;

  ALTER TABLE ONLY auth_tokens
      ADD CONSTRAINT auth_tokens_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

  ALTER TABLE ONLY auth_tokens
      ADD CONSTRAINT auth_tokens_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

  ALTER TABLE ONLY cart_items
      ADD CONSTRAINT cart_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

  ALTER TABLE ONLY cart_items
      ADD CONSTRAINT cart_items_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES users(id) ON DELETE CASCADE;

  ALTER TABLE ONLY credit_requests
      ADD CONSTRAINT credit_requests_company_reviewed_by_fkey FOREIGN KEY (company_reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

  ALTER TABLE ONLY credit_requests
      ADD CONSTRAINT credit_requests_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT;

  ALTER TABLE ONLY credit_requests
      ADD CONSTRAINT credit_requests_requested_by_fkey FOREIGN KEY (requested_by) REFERENCES users(id) ON DELETE SET NULL;

  ALTER TABLE ONLY credit_requests
      ADD CONSTRAINT credit_requests_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES users(id) ON DELETE SET NULL;

  ALTER TABLE ONLY credit_requests
      ADD CONSTRAINT credit_requests_topup_package_id_fkey FOREIGN KEY (topup_package_id) REFERENCES topup_packages(id) ON DELETE RESTRICT;

  ALTER TABLE ONLY credit_requests
      ADD CONSTRAINT credit_requests_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

  ALTER TABLE ONLY credit_transactions
      ADD CONSTRAINT credit_transactions_created_by_user_id_fkey FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE RESTRICT;

  ALTER TABLE ONLY credit_transactions
      ADD CONSTRAINT credit_transactions_refunds_transaction_id_fkey FOREIGN KEY (refunds_transaction_id) REFERENCES credit_transactions(id) ON DELETE RESTRICT;

  ALTER TABLE ONLY credit_transactions
      ADD CONSTRAINT credit_transactions_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES subscriptions(id) ON DELETE RESTRICT;

  ALTER TABLE ONLY credit_transactions
      ADD CONSTRAINT credit_transactions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT;

  ALTER TABLE ONLY deliveries
      ADD CONSTRAINT deliveries_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

  ALTER TABLE ONLY delivery_events
      ADD CONSTRAINT delivery_events_delivery_id_fkey FOREIGN KEY (delivery_id) REFERENCES deliveries(id) ON DELETE CASCADE;

  ALTER TABLE ONLY donation_offers
      ADD CONSTRAINT donation_offers_donor_id_fkey FOREIGN KEY (donor_id) REFERENCES users(id) ON DELETE CASCADE;

  ALTER TABLE ONLY donation_offers
      ADD CONSTRAINT donation_offers_source_product_id_fkey FOREIGN KEY (source_product_id) REFERENCES products(id) ON DELETE SET NULL;

  ALTER TABLE ONLY email_queue
      ADD CONSTRAINT email_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

  ALTER TABLE ONLY favorites
      ADD CONSTRAINT favorites_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES users(id) ON DELETE CASCADE;

  ALTER TABLE ONLY favorites
      ADD CONSTRAINT favorites_store_id_fkey FOREIGN KEY (store_id) REFERENCES users(id) ON DELETE CASCADE;

  ALTER TABLE ONLY notifications
      ADD CONSTRAINT notifications_announcement_id_fkey FOREIGN KEY (announcement_id) REFERENCES announcements(id) ON DELETE SET NULL;

  ALTER TABLE ONLY notifications
      ADD CONSTRAINT notifications_branch_id_fkey FOREIGN KEY (branch_id) REFERENCES users(id) ON DELETE SET NULL;

  ALTER TABLE ONLY notifications
      ADD CONSTRAINT notifications_credit_request_id_fkey FOREIGN KEY (credit_request_id) REFERENCES credit_requests(id) ON DELETE SET NULL;

  ALTER TABLE ONLY notifications
      ADD CONSTRAINT notifications_donation_id_fkey FOREIGN KEY (donation_id) REFERENCES donation_offers(id) ON DELETE SET NULL;

  ALTER TABLE ONLY notifications
      ADD CONSTRAINT notifications_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

  ALTER TABLE ONLY notifications
      ADD CONSTRAINT notifications_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

  ALTER TABLE ONLY notifications
      ADD CONSTRAINT notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

  ALTER TABLE ONLY order_items
      ADD CONSTRAINT order_items_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

  ALTER TABLE ONLY order_items
      ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

  ALTER TABLE ONLY order_items
      ADD CONSTRAINT order_items_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES users(id) ON DELETE RESTRICT;

  ALTER TABLE ONLY order_status_history
      ADD CONSTRAINT order_status_history_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL;

  ALTER TABLE ONLY order_status_history
      ADD CONSTRAINT order_status_history_item_id_fkey FOREIGN KEY (item_id) REFERENCES order_items(id) ON DELETE CASCADE;

  ALTER TABLE ONLY order_status_history
      ADD CONSTRAINT order_status_history_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE;

  ALTER TABLE ONLY orders
      ADD CONSTRAINT orders_restaurant_id_fkey FOREIGN KEY (restaurant_id) REFERENCES users(id) ON DELETE RESTRICT;

  ALTER TABLE ONLY orders
      ADD CONSTRAINT orders_store_id_fkey FOREIGN KEY (store_id) REFERENCES users(id) ON DELETE RESTRICT;

  ALTER TABLE ONLY product_shop_sales
      ADD CONSTRAINT product_shop_sales_created_by_fkey FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL;

  ALTER TABLE ONLY product_shop_sales
      ADD CONSTRAINT product_shop_sales_order_id_fkey FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL;

  ALTER TABLE ONLY product_shop_sales
      ADD CONSTRAINT product_shop_sales_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

  ALTER TABLE ONLY product_shop_sales
      ADD CONSTRAINT product_shop_sales_store_id_fkey FOREIGN KEY (store_id) REFERENCES users(id) ON DELETE CASCADE;

  ALTER TABLE ONLY product_templates
      ADD CONSTRAINT product_templates_store_id_fkey FOREIGN KEY (store_id) REFERENCES users(id) ON DELETE CASCADE;

  ALTER TABLE ONLY products
      ADD CONSTRAINT products_store_id_fkey FOREIGN KEY (store_id) REFERENCES users(id) ON DELETE CASCADE;

  ALTER TABLE ONLY subscriptions
      ADD CONSTRAINT subscriptions_credit_request_id_fkey FOREIGN KEY (credit_request_id) REFERENCES credit_requests(id) ON DELETE SET NULL;

  ALTER TABLE ONLY subscriptions
      ADD CONSTRAINT subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE RESTRICT;

  ALTER TABLE ONLY subscriptions
      ADD CONSTRAINT subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE;

  ALTER TABLE ONLY users
      ADD CONSTRAINT users_city_id_fkey FOREIGN KEY (city_id) REFERENCES cities(id) ON DELETE RESTRICT;

  ALTER TABLE ONLY users
      ADD CONSTRAINT users_company_id_fkey FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE RESTRICT;

  ALTER TABLE ONLY users
      ADD CONSTRAINT users_deactivated_by_fkey FOREIGN KEY (deactivated_by) REFERENCES users(id) ON DELETE SET NULL;
`;

// Indexes.
const INDEXES = String.raw`
  CREATE INDEX account_events_user_id_created_at_index ON account_events USING btree (user_id, created_at);

  CREATE INDEX admin_actions_admin_id_index ON admin_actions USING btree (admin_id);

  CREATE INDEX admin_actions_created_at_index ON admin_actions USING btree (created_at);

  CREATE INDEX admin_actions_target_company_id_index ON admin_actions USING btree (target_company_id);

  CREATE INDEX admin_actions_target_order_id_index ON admin_actions USING btree (target_order_id);

  CREATE INDEX admin_actions_target_user_id_index ON admin_actions USING btree (target_user_id);

  CREATE INDEX announcements_created_at_index ON announcements USING btree (created_at);

  CREATE INDEX auth_tokens_created_by_index ON auth_tokens USING btree (created_by);

  CREATE INDEX auth_tokens_user_id_created_at_index ON auth_tokens USING btree (user_id, created_at);

  CREATE INDEX cart_items_product_id_index ON cart_items USING btree (product_id);

  CREATE UNIQUE INDEX companies_name_lower_unique ON companies USING btree (lower((name)::text));

  CREATE UNIQUE INDEX credit_requests_one_open_topup ON credit_requests USING btree (user_id) WHERE ((request_type = 'TOPUP'::credit_request_type) AND (status = ANY (ARRAY['PENDING'::credit_request_status, 'COMPANY_REVIEW'::credit_request_status])));

  CREATE UNIQUE INDEX credit_requests_one_pending_subscription ON credit_requests USING btree (user_id, period_month) WHERE ((status = 'PENDING'::credit_request_status) AND (request_type = 'SUBSCRIPTION'::credit_request_type));

  CREATE INDEX credit_requests_requested_by_index ON credit_requests USING btree (requested_by);

  CREATE INDEX credit_requests_status_created_at_index ON credit_requests USING btree (status, created_at);

  CREATE INDEX credit_transactions_related_entity_type_related_entity_id_index ON credit_transactions USING btree (related_entity_type, related_entity_id);

  CREATE INDEX credit_transactions_user_id_period_month_index ON credit_transactions USING btree (user_id, period_month);

  CREATE INDEX delivery_events_delivery_id_index ON delivery_events USING btree (delivery_id);

  CREATE INDEX donation_offers_donor_id_index ON donation_offers USING btree (donor_id);

  CREATE INDEX donation_offers_status_expiry_date_index ON donation_offers USING btree (status, expiry_date);

  CREATE INDEX email_queue_due ON email_queue USING btree (next_attempt_at) WHERE ((status)::text = 'PENDING'::text);

  CREATE INDEX email_queue_user_id_index ON email_queue USING btree (user_id);

  CREATE INDEX notifications_order_id_index ON notifications USING btree (order_id);

  CREATE INDEX notifications_user_id_created_at_index ON notifications USING btree (user_id, created_at);

  CREATE INDEX order_items_order_id_index ON order_items USING btree (order_id);

  CREATE INDEX order_items_product_id_status_index ON order_items USING btree (product_id, status);

  CREATE INDEX order_items_restaurant_id_index ON order_items USING btree (restaurant_id);

  CREATE INDEX order_status_history_actor_id_index ON order_status_history USING btree (actor_id);

  CREATE INDEX order_status_history_item_id_index ON order_status_history USING btree (item_id);

  CREATE INDEX order_status_history_order_id_created_at_index ON order_status_history USING btree (order_id, created_at);

  CREATE INDEX orders_restaurant_id_status_index ON orders USING btree (restaurant_id, status);

  CREATE INDEX orders_status_pickup_at_index ON orders USING btree (status, pickup_at);

  CREATE INDEX orders_store_id_status_index ON orders USING btree (store_id, status);

  CREATE INDEX product_shop_sales_order_id_index ON product_shop_sales USING btree (order_id);

  CREATE INDEX product_shop_sales_product_id_index ON product_shop_sales USING btree (product_id);

  CREATE INDEX product_shop_sales_store_id_index ON product_shop_sales USING btree (store_id);

  CREATE INDEX products_status_expiry_date_index ON products USING btree (status, expiry_date);

  CREATE INDEX products_store_id_index ON products USING btree (store_id);

  CREATE INDEX users_city_id_index ON users USING btree (city_id);

  CREATE INDEX users_company_id_index ON users USING btree (company_id);

  CREATE UNIQUE INDEX users_email_lower_unique ON users USING btree (lower((email)::text));
`;

// Triggers.
const TRIGGERS = String.raw`
  CREATE TRIGGER credit_requests_snapshot BEFORE INSERT ON credit_requests FOR EACH ROW EXECUTE FUNCTION snapshot_credit_request();

  CREATE TRIGGER credit_transactions_append_only BEFORE DELETE OR UPDATE ON credit_transactions FOR EACH ROW EXECUTE FUNCTION protect_credit_ledger();

  CREATE TRIGGER deliveries_live_event AFTER INSERT OR UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION notify_order_change();

  CREATE TRIGGER notifications_live_event AFTER INSERT ON notifications FOR EACH ROW EXECUTE FUNCTION notify_new_notification();

  CREATE TRIGGER order_items_live_event AFTER INSERT OR UPDATE ON order_items FOR EACH ROW EXECUTE FUNCTION notify_order_change();

  CREATE TRIGGER orders_live_event AFTER INSERT OR UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION notify_order_change();

  CREATE TRIGGER set_companies_updated_at BEFORE UPDATE ON companies FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  CREATE TRIGGER set_deliveries_updated_at BEFORE UPDATE ON deliveries FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  CREATE TRIGGER set_donation_offers_updated_at BEFORE UPDATE ON donation_offers FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  CREATE TRIGGER set_email_queue_updated_at BEFORE UPDATE ON email_queue FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  CREATE TRIGGER set_order_items_updated_at BEFORE UPDATE ON order_items FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  CREATE TRIGGER set_orders_updated_at BEFORE UPDATE ON orders FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  CREATE TRIGGER set_product_templates_updated_at BEFORE UPDATE ON product_templates FOR EACH ROW EXECUTE FUNCTION set_updated_at();

  CREATE TRIGGER set_products_updated_at BEFORE UPDATE ON products FOR EACH ROW EXECUTE FUNCTION set_updated_at();
`;

// Reference data: the cities (the fixed list profiles choose from, with coordinates for distances),
// the credit plans and the top-up packages.
const REFERENCE_DATA = String.raw`
  INSERT INTO cities (name, latitude, longitude) VALUES
    ('Sarajevo', 43.856300, 18.413100),
    ('Ilidža', 43.829700, 18.310800),
    ('Vogošća', 43.900600, 18.343900),
    ('Hadžići', 43.822800, 18.201400),
    ('Ilijaš', 43.950000, 18.271700),
    ('Visoko', 43.988900, 18.178100),
    ('Breza', 44.018600, 18.261100),
    ('Kakanj', 44.130000, 18.120600),
    ('Vareš', 44.164700, 18.328300),
    ('Olovo', 44.127800, 18.581400),
    ('Zenica', 44.201700, 17.907800),
    ('Žepče', 44.426700, 18.038100),
    ('Zavidovići', 44.445800, 18.149700),
    ('Maglaj', 44.545000, 18.100300),
    ('Tešanj', 44.611400, 17.985800),
    ('Kladanj', 44.225000, 18.692500),
    ('Banovići', 44.408600, 18.529400),
    ('Živinice', 44.449400, 18.649400),
    ('Tuzla', 44.538400, 18.676300),
    ('Lukavac', 44.542500, 18.525000),
    ('Kalesija', 44.441100, 18.870800),
    ('Srebrenik', 44.706400, 18.488600),
    ('Gračanica', 44.703100, 18.308300);

  INSERT INTO plans (name, credits_per_period, price) VALUES
    ('Basic', 20, 15.00),
    ('Standard', 50, 30.00),
    ('Pro', 150, 75.00);

  INSERT INTO topup_packages (credits, price) VALUES
    (10, 8.00),
    (20, 15.00),
    (50, 35.00);
`;

export const up = (pgm: MigrationBuilder) => {
  for (const sql of [TYPES, TABLES, FUNCTIONS, FOREIGN_KEYS, INDEXES, TRIGGERS, REFERENCE_DATA]) pgm.sql(sql);
};

export const down = (pgm: MigrationBuilder) => {
  pgm.sql(String.raw`
  DROP TABLE account_events, admin_actions, announcement_dismissals, announcements, auth_tokens, cart_items, cities, companies, credit_requests, credit_transactions, deliveries, delivery_events, donation_offers, email_queue, favorites, notifications, order_items, order_status_history, orders, plans, product_shop_sales, product_templates, products, subscriptions, topup_packages, users CASCADE;
  DROP FUNCTION city_distance_km(integer, integer), notify_new_notification(), notify_order_change(), protect_credit_ledger(), set_updated_at(), snapshot_credit_request();
  DROP TYPE admin_action_type, announcement_audience, credit_actor, credit_request_source, credit_request_status, credit_request_type, credit_transaction_type, delivery_status, donation_status, donation_type, fulfilment_method, order_change_reason, order_event_source, order_item_status, order_status, product_status, subscription_status, user_role;
  `);
};
