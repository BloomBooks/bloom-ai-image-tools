import React from "react";
import { theme } from "../themes";

export type ImageSlotRolePillModel = {
  label: string;
  kind?: "target" | "reference";
  testId?: string;
};

export interface ImageSlotRolePillProps {
  pill: ImageSlotRolePillModel;
}

export const ImageSlotRolePill: React.FC<ImageSlotRolePillProps> = ({
  pill,
}) => {
  return (
    <div
      data-testid={pill.testId}
      style={{
        position: "absolute",
        top: 8,
        left: 8,
        padding: "4px 8px",
        borderRadius: "999px",
        fontSize: "10px",
        fontWeight: 600,
        letterSpacing: "0.08em",
        userSelect: "none",
        zIndex: 10,
        backgroundColor:
          pill.kind === "target" ? theme.colors.accent : theme.colors.overlay,
        color: theme.colors.textPrimary,
        border: `1px solid ${theme.colors.panelBorder}`,
        boxShadow: theme.colors.insetShadow,
      }}
    >
      {pill.label}
    </div>
  );
};
