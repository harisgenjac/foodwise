import type { MigrationBuilder } from "node-pg-migrate";

// The store page's cover image was dropped (the profile redesign has no place for it), so its
// column goes too. Files left under uploads/covers are not referenced any more.
export const up = (pgm: MigrationBuilder) => {
  pgm.sql("ALTER TABLE users DROP COLUMN cover_url");
};

export const down = (pgm: MigrationBuilder) => {
  pgm.sql("ALTER TABLE users ADD COLUMN cover_url text");
};
