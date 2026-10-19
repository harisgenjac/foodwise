import {
  Apple,
  Beef,
  Carrot,
  Croissant,
  CupSoda,
  Fish,
  Milk,
  Package,
  Snowflake,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export const CATEGORY_ICONS: Record<string, LucideIcon> = {
  Meat: Beef,
  Fish: Fish,
  Dairy: Milk,
  Vegetables: Carrot,
  Fruits: Apple,
  Bakery: Croissant,
  Drinks: CupSoda,
  'Frozen Food': Snowflake,
  Other: Package,
};

export const getCategoryIcon = (category: string): LucideIcon =>
  CATEGORY_ICONS[category] ?? Package;
