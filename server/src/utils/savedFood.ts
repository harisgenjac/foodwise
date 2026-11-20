// Food saved as three columns (kg, l, pieces) over the order items matching `filter` (an SQL
// condition on order items joined with products): g and ml are converted to kg and l, kom and pak
// are counted together as pieces. Used by a branch's monthly stats.
export const savedUnits = (filter: string) => `
  COALESCE(SUM(CASE products.unit WHEN 'kg' THEN order_items.quantity WHEN 'g' THEN order_items.quantity / 1000 END)
    FILTER (WHERE ${filter}), 0) AS kg,
  COALESCE(SUM(CASE products.unit WHEN 'l' THEN order_items.quantity WHEN 'ml' THEN order_items.quantity / 1000 END)
    FILTER (WHERE ${filter}), 0) AS l,
  COALESCE(SUM(CASE WHEN products.unit IN ('kom', 'pak') THEN order_items.quantity END)
    FILTER (WHERE ${filter}), 0) AS pieces`;
