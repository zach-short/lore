
import { Text } from "@/tw";

import type { ReactNode } from "react";

type SectionLabelProps = {
  children: ReactNode;
  className?: string;
};

/** Billing-block eyebrow: the condensed-caps label that structures every screen. */
export function SectionLabel({ children, className }: SectionLabelProps) {
  return (
    <Text
      className={`font-display text-sm tracking-[2px] text-faint uppercase ${className ?? ""}`}
    >
      {children}
    </Text>
  );
}
