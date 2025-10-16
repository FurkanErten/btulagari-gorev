"use client";
import { usePathname } from "next/navigation";
import WeekStrip from "@/components/WeekStrip";

export default function WeekStripGate() {
  const pathname = usePathname();
  // /calendar ve alt yollarında mini takvimi gizle
  if (pathname?.startsWith("/calendar")) return null;
  return <WeekStrip />;
}
