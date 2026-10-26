import {
  Cog,
  Construction,
  Drill,
  Droplets,
  Plus,
  Shovel,
  Sprout,
  Tractor,
  Truck,
  Warehouse,
} from "lucide-react";
import type { ServiceIconName } from "@/lib/fieldly/types";

const ICONS = {
  drill: Drill,
  shovel: Shovel,
  crane: Construction,
  tractor: Tractor,
  tanker: Droplets,
  tipper: Truck,
  agri: Sprout,
  construction: Warehouse,
  rental: Cog,
  other: Plus,
} satisfies Record<ServiceIconName, typeof Drill>;

export function ServiceIcon({
  name,
  className,
}: {
  name: ServiceIconName | string
  className?: string
}) {
  const Icon = ICONS[name as ServiceIconName] ?? Cog;
  return <Icon className={className} strokeWidth={1.75} aria-hidden />;
}
