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
  ThumbnailStripConfig,
} from "../../lib/thumbnailStrips";
import { theme } from "../../themes";
import {
  STRIP_BORDER,
  STRIP_ACTIVE_BORDER_COLOR,
  STRIP_TAB_RADIUS,
  STRIP_BORDER_WIDTH,
} from "./stripStyleConstants";

const PIN_BUTTON_SX = {
  borderRadius: "50%",
  border: "none",
  backgroundColor: "transparent",
  color: theme.colors.textPrimary,
  opacity: 0.85,
  boxShadow: "none",
  transition: "opacity 120ms ease",
  "&:hover": {
    opacity: 1,
    backgroundColor: "transparent",
  },
} as const;

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
  stripConfigs?: Record<ThumbnailStripId, ThumbnailStripConfig>;
  onActivate: (stripId: ThumbnailStripId) => void;
  onTogglePin: (stripId: ThumbnailStripId) => void;
  onDragActivate: (stripId: ThumbnailStripId) => void;
}

export const ThumbnailStripTabs: React.FC<ThumbnailStripTabsProps> = ({
  snapshot,
  stripIds = THUMBNAIL_STRIP_ORDER,
  activeStripId,
  stripConfigs,
  onActivate,
  onTogglePin,
  onDragActivate,
}) => {
  if (!stripIds.length) {
    return null;
  }

  const resolvedStripConfigs = stripConfigs ?? THUMBNAIL_STRIP_CONFIGS;

  const resolvedActiveId =
    activeStripId !== undefined ? activeStripId : snapshot.activeStripId;
  const isCompact = stripIds.length === 1;
  const railWidth = 96;
  const railPaddingY = isCompact ? 0.25 : 0.5;
  const pinSize = isCompact ? 22 : 26;
  const tabGap = isCompact ? 0.5 : 0.75;

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

  const renderPinButton = (stripId: ThumbnailStripId, isPinned: boolean) => (
    <IconButton
      component="span"
      size="small"
      disableRipple
      onClick={(event) => handlePinClick(event, stripId)}
      title={isPinned ? "Unpin strip" : "Pin strip"}
      aria-label={
        isPinned
          ? `Unpin ${resolvedStripConfigs[stripId].label}`
          : `Pin ${resolvedStripConfigs[stripId].label}`
      }
      data-testid={`thumbnail-tab-pin-${stripId}`}
      sx={{
        ...PIN_BUTTON_SX,
        width: pinSize,
        height: pinSize,
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
    const label = resolvedStripConfigs[stripId].label;

    return (
      <Tooltip title={label} placement="left" arrow>
        <Box
          sx={{
            border: "none",
            borderTopLeftRadius: 0,
            borderBottomLeftRadius: 0,
            borderTopRightRadius: STRIP_TAB_RADIUS,
            borderBottomRightRadius: STRIP_TAB_RADIUS,
            backgroundColor: "transparent",
            boxShadow: "none",
            overflow: "hidden",
            display: "grid",
            gridTemplateColumns: "1fr auto",
            alignItems: "stretch",
            transition: "all 140ms ease",
            ...(isActive
              ? {
                  backgroundColor: theme.colors.surface,
                  border: STRIP_BORDER,
                  borderColor: STRIP_ACTIVE_BORDER_COLOR,
                  borderLeftWidth: 0,
                  boxShadow: theme.colors.panelShadow,
                  zIndex: 1,
                }
              : {}),
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
              border: "none",
            }}
          >
            {renderPinButton(stripId, isPinned)}
          </Box>
        </Box>
      </Tooltip>
    );
  };

  return (
    <Box
      sx={{
        paddingTop: railPaddingY,
        paddingBottom: railPaddingY,
        paddingLeft: 0,
        paddingRight: isCompact ? 0 : 0.5,
        flexShrink: 0,
        width: railWidth,
        display: "flex",
        flexDirection: "column",
        justifyContent: "flex-end",
        gap: tabGap,
        marginLeft: "-1px", // cover up this bit of the border of the box we're next to so that it looks seamless
      }}
    >
      {stripIds.map((stripId) => (
        <React.Fragment key={`${stripId}-${isCompact ? "compact" : "full"}`}>
          {renderTab(stripId)}
        </React.Fragment>
      ))}
    </Box>
  );
};
