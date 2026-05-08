"use client";

import {
  BottleWine,
  Cherry,
  CircleHelp,
  Citrus,
  CupSoda,
  Droplets,
  GlassWater,
  Package,
  Snowflake,
  Beaker,
  Utensils,
  Wine,
  Wrench,
  type LucideIcon,
} from "lucide-react";

const icons: Record<string, LucideIcon> = {
  Bottle: BottleWine,
  BottleWine,
  Cherry,
  Citrus,
  CupSoda,
  Droplets,
  GlassWater,
  Lemon: Citrus,
  Package,
  Beaker,
  Snowflake,
  Spoon: Utensils,
  Utensils,
  Wine,
  Wrench,
};

export const selectableIcons = [
  "BottleWine",
  "GlassWater",
  "Package",
  "CupSoda",
  "Citrus",
  "Droplets",
  "Cherry",
  "Wine",
  "Wrench",
  "Utensils",
  "Beaker",
  "Snowflake",
] as const;

export function ItemIcon({ name, size = 20 }: { name?: string | null; size?: number }) {
  const Icon = name ? icons[name] ?? CircleHelp : CircleHelp;
  return <Icon aria-hidden size={size} strokeWidth={1.8} />;
}
