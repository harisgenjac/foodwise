/**
 * @type {import('node-pg-migrate').ColumnDefinitions | undefined}
 */
export const shorthands = undefined;

// A product (and a template) gets its own image instead of the category's photo. The value is
// either an uploaded file (/uploads/products/<file>) or one of the suggested images
// (suggested:<key>, see src/utils/productImages.ts); NULL shows the generic product image.
// Existing rows get their category's suggested image once, so nothing changes on screen; from
// now on the category never sets the image. Donations keep their category photos.
const CATEGORY_KEYS = `CASE category
  WHEN 'Meat' THEN 'suggested:meat'
  WHEN 'Fish' THEN 'suggested:fish'
  WHEN 'Dairy' THEN 'suggested:dairy'
  WHEN 'Vegetables' THEN 'suggested:vegetables'
  WHEN 'Fruits' THEN 'suggested:fruits'
  WHEN 'Bakery' THEN 'suggested:bakery'
  WHEN 'Drinks' THEN 'suggested:drinks'
  WHEN 'Frozen Food' THEN 'suggested:frozen'
  ELSE 'suggested:other'
END`;

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const up = (pgm) => {
  pgm.addColumn("products", { image_url: { type: "text" } });
  pgm.addColumn("product_templates", { image_url: { type: "text" } });
  // The backfill is not an edit: the triggers would move updated_at (templates are listed by it).
  pgm.sql("ALTER TABLE products DISABLE TRIGGER set_products_updated_at");
  pgm.sql(`UPDATE products SET image_url = ${CATEGORY_KEYS}`);
  pgm.sql("ALTER TABLE products ENABLE TRIGGER set_products_updated_at");
  pgm.sql("ALTER TABLE product_templates DISABLE TRIGGER set_product_templates_updated_at");
  pgm.sql(`UPDATE product_templates SET image_url = ${CATEGORY_KEYS}`);
  pgm.sql("ALTER TABLE product_templates ENABLE TRIGGER set_product_templates_updated_at");
};

/**
 * @param pgm {import('node-pg-migrate').MigrationBuilder}
 */
export const down = (pgm) => {
  pgm.dropColumn("product_templates", "image_url");
  pgm.dropColumn("products", "image_url");
};
