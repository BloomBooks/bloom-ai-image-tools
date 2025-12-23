import React from "react";
import { theme } from "../themes";

interface PanelToolbarProps {
  label: string;
  actions?: React.ReactNode;
  className?: string;
}

export const PanelToolbar: React.FC<PanelToolbarProps> = ({
  label,
  actions,
  className,
}) => {
  const classes = [
    "flex items-center justify-between rounded-2xl shadow-lg backdrop-blur-md w-full",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={classes}
      style={{
        backgroundColor: theme.colors.overlay,
        color: theme.colors.textPrimary,
        paddingLeft: "6px",
        //minHeight: 32,
        gap: 8,
        boxShadow: theme.colors.panelShadow,
      }}
    >
      <div
        className="text-[11px] font-semibold uppercase tracking-[0.12em]"
        style={{ opacity: 0.85 }}
      >
        {label}
      </div>
      {actions ? (
        <div className="flex items-center gap-2 flex-wrap justify-end">
          {actions}
        </div>
      ) : null}
    </div>
  );
};
