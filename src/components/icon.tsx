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
  Wine,
  Wrench,
};

export function ItemIcon({ name, size = 20 }: { name?: string | null; size?: number }) {
  const Icon = name ? icons[name] ?? CircleHelp : CircleHelp;
  return <Icon aria-hidden size={size} strokeWidth={1.8} />;
}
