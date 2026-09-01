import { use } from "react";
import { EquipmentDetail } from "@/components/asset/EquipmentDetail";

/**
 * The canonical machine detail page — everything the fleet knows about one
 * machine, plus every series it has produced.
 *
 * The implementation is shared with `/asset/[assetId]`, which C7 shipped first
 * and which the demo script still names; that route now redirects here.
 */
export default function EquipmentDetailPage({ params }: PageProps<"/equipment/[equipmentId]">) {
  // Next 16: route params arrive as a promise.
  const { equipmentId } = use(params);
  return <EquipmentDetail equipmentId={equipmentId} />;
}
