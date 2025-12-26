import React from "react";
import IconButton from "@mui/material/IconButton";
import Tooltip from "@mui/material/Tooltip";
import Box from "@mui/material/Box";
import PushPinIcon from "@mui/icons-material/PushPin";
import PushPinOutlinedIcon from "@mui/icons-material/PushPinOutlined";
import HistoryToggleOffIcon from "@mui/icons-material/HistoryToggleOff";
import StarOutlineIcon from "@mui/icons-material/StarOutline";
import CollectionsBookmarkIcon from "@mui/icons-material/CollectionsBookmark";
import AutoStoriesIcon from "@mui/icons-material/AutoStories";
import type { SvgIconProps } from "@mui/material/SvgIcon";
import { ThumbnailStripId, ThumbnailStripsSnapshot } from "../../types";
import {
  THUMBNAIL_STRIP_ORDER,
  THUMBNAIL_STRIP_CONFIGS,
} from "../../lib/thumbnailStrips";
import { theme } from "../../themes";

const STRIP_ICONS: Record<
  ThumbnailStripId,
  React.ComponentType<SvgIconProps>
> = {
  history: HistoryToggleOffIcon,
  starred: StarOutlineIcon,
  reference: CollectionsBookmarkIcon,
  environment: AutoStoriesIcon,
};

interface ThumbnailStripTabsProps {
  snapshot: ThumbnailStripsSnapshot;
  stripIds?: ThumbnailStripId[];
  activeStripId?: ThumbnailStripId | null;
  onActivate: (stripId: ThumbnailStripId) => void;
  onTogglePin: (stripId: ThumbnailStripId) => void;
  onDragActivate: (stripId: ThumbnailStripId) => void;
}

export const ThumbnailStripTabs: React.FC<ThumbnailStripTabsProps> = ({
  snapshot,
  stripIds = THUMBNAIL_STRIP_ORDER,
  activeStripId,
  onActivate,
  onTogglePin,
  onDragActivate,
}) => {
  if (!stripIds.length) {
    return null;
  }

  const resolvedActiveId =
    activeStripId !== undefined ? activeStripId : snapshot.activeStripId;
  const isCompact = stripIds.length === 1;
  const railWidth = 96;
  const railPadding = isCompact ? 0.5 : 1;
  const pinSize = isCompact ? 22 : 26;
  const tabPadding = isCompact ? 0.5 : 1;

  const handleTabClick = (stripId: ThumbnailStripId) => {
    onActivate(stripId);
  };

  const handleDragEnter = (
    event: React.DragEvent,
    stripId: ThumbnailStripId
  ) => {
    event.preventDefault();
    onDragActivate(stripId);
  };

  const handlePinClick = (
    event: React.MouseEvent<HTMLElement>,
    stripId: ThumbnailStripId
  ) => {
    event.stopPropagation();
    event.preventDefault();
    onTogglePin(stripId);
  };

  const renderPinButton = (
    stripId: ThumbnailStripId,
    isPinned: boolean,
    dimension: number
  ) => (
    <IconButton
      component="span"
      size="small"
      disableRipple
      onClick={(event) => handlePinClick(event, stripId)}
      title={isPinned ? "Unpin strip" : "Pin strip"}
      aria-label={
        isPinned
          ? `Unpin ${THUMBNAIL_STRIP_CONFIGS[stripId].label}`
          : `Pin ${THUMBNAIL_STRIP_CONFIGS[stripId].label}`
      }
      data-testid={`thumbnail-tab-pin-${stripId}`}
      sx={{
        borderRadius: "50%",
        border: "none",
        backgroundColor: isPinned
          ? theme.colors.accentSubtle
          : theme.colors.surfaceRaised,
        color: isPinned ? theme.colors.accent : theme.colors.textPrimary,
        width: dimension,
        height: dimension,
        boxShadow: theme.colors.panelShadow,
      }}
    >
      {isPinned ? (
        <PushPinIcon fontSize="inherit" />
      ) : (
        <PushPinOutlinedIcon fontSize="inherit" />
      )}
    </IconButton>
  );
  const renderTab = (stripId: ThumbnailStripId) => {
    const IconComponent = STRIP_ICONS[stripId];
    const isPinned = snapshot.pinnedStripIds.includes(stripId);
    const isActive = resolvedActiveId === stripId;
    const tabId = `thumbnail-tab-${stripId}`;
    const label = THUMBNAIL_STRIP_CONFIGS[stripId].label;

    return (
      <Tooltip
        key={`${stripId}-${isCompact ? "compact" : "full"}`}
        title={label}
        placement="left"
        arrow
      >
        <Box
        sx={{
          border: `1px solid ${
            isActive ? theme.colors.accent : theme.colors.border
          }`,
          borderRadius: 2,
          backgroundColor: isActive
            ? theme.colors.surfaceRaised
            : theme.colors.surfaceAlt,
          boxShadow: isActive ? theme.colors.panelShadow : "none",
          overflow: "hidden",
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "stretch",
        }}
      >
        <button
          type="button"
          id={tabId}
          data-testid={tabId}
          onClick={() => handleTabClick(stripId)}
          onDragEnter={(event) => handleDragEnter(event, stripId)}
          style={{
            width: "100%",
            minHeight: 42,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 8,
            background: "none",
            border: "none",
            cursor: "pointer",
            color: theme.colors.textPrimary,
          }}
        >
          <IconComponent fontSize="medium" />
        </button>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            paddingRight: 1,
          }}
        >
          {renderPinButton(stripId, isPinned, pinSize)}
        </Box>
        </Box>
      </Tooltip>
    );
  };

  return (
    <Box
      sx={{
        borderLeft: `1px solid ${theme.colors.border}`,
        backgroundColor: theme.colors.surface,
        padding: railPadding,
        flexShrink: 0,
        width: railWidth,
        display: "flex",
        flexDirection: "column",
        gap: tabPadding,
      }}
    >
      {stripIds.map((stripId) => renderTab(stripId))}
    </Box>
  );
};
