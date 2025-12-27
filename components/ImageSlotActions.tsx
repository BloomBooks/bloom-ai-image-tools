import React from "react";
import { ClickAwayListener, IconButton, Popper, Tooltip } from "@mui/material";
import type { SxProps, Theme as MuiTheme } from "@mui/material/styles";
import { useDndContext } from "@dnd-kit/core";
import { ImageRecord } from "../types";
import { theme } from "../themes";
import { Icon, Icons } from "./Icons";
import { ImageInfoPanel } from "./ImageInfoPanel";

type SlotControls = {
  upload: boolean;
  paste: boolean;
  copy: boolean;
  download: boolean;
  remove: boolean;
};

type SlotActionKey = keyof SlotControls | "info" | "magnifier" | "more";

type SlotActionButton = {
  key: SlotActionKey;
  icon: string;
  title: string;
  onClick: () => void;
  ariaPressed?: boolean;
  isActive?: boolean;
  testId?: string;
  isVisible?: boolean;
};

const moveRemoveToEnd = (actions: SlotActionButton[]) => {
  const removeIndex = actions.findIndex((action) => action.key === "remove");
  if (removeIndex === -1 || removeIndex === actions.length - 1) return actions;
  const reordered = [...actions];
  const [removeAction] = reordered.splice(removeIndex, 1);
  reordered.push(removeAction);
  return reordered;
};

const insertBeforeRemove = (
  actions: SlotActionButton[],
  actionToInsert: SlotActionButton
) => {
  const removeIndex = actions.findIndex((action) => action.key === "remove");
  if (removeIndex === -1) return [...actions, actionToInsert];
  const next = [...actions];
  next.splice(removeIndex, 0, actionToInsert);
  return next;
};

export type ImageSlotActionsHandle = {
  notifyPointerMove: () => void;
};

export type ImageSlotActionsProps = {
  placement: "header" | "overlay";
  variant: "panel" | "tile" | "thumb";
  image: ImageRecord | null;
  disabled: boolean;
  isHovered: boolean;
  controls: SlotControls;
  supportsUpload: boolean;
  supportsRemove: boolean;
  actionLabels?: Partial<Record<keyof SlotControls, string>>;
  iconSize: number;
  buttonPadding: number;
  cornerOffset: number;
  isMagnifierPinned: boolean;
  onUploadClick: () => void;
  onPaste: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onRemove: () => void;
  onOpenInfo: () => void;
  onToggleMagnifier: () => void;
};

export const ImageSlotActions = React.forwardRef<
  ImageSlotActionsHandle,
  ImageSlotActionsProps
>(function ImageSlotActions(props, ref) {
  const {
    placement,
    variant,
    image,
    disabled,
    isHovered,
    controls,
    supportsUpload,
    supportsRemove,
    actionLabels,
    iconSize,
    buttonPadding,
    cornerOffset,
    isMagnifierPinned,
    onUploadClick,
    onPaste,
    onCopy,
    onDownload,
    onRemove,
    onOpenInfo,
    onToggleMagnifier,
  } = props;

  const { active } = useDndContext();
  const isDndDragging = Boolean(active);

  const moreButtonRef = React.useRef<HTMLButtonElement | null>(null);
  const closeTimeoutRef = React.useRef<number | null>(null);
  const moreDelayTimeoutRef = React.useRef<number | null>(null);

  const [isThumbOverflowOpen, setIsThumbOverflowOpen] = React.useState(false);
  const [isThumbMoreReady, setIsThumbMoreReady] = React.useState(false);

  const clearMoreDelayTimeout = React.useCallback(() => {
    if (moreDelayTimeoutRef.current != null) {
      window.clearTimeout(moreDelayTimeoutRef.current);
      moreDelayTimeoutRef.current = null;
    }
  }, []);

  const scheduleMoreReady = React.useCallback(() => {
    clearMoreDelayTimeout();
    moreDelayTimeoutRef.current = window.setTimeout(() => {
      setIsThumbMoreReady(true);
      moreDelayTimeoutRef.current = null;
    }, 100);
  }, [clearMoreDelayTimeout]);

  const clearCloseTimeout = React.useCallback(() => {
    if (closeTimeoutRef.current != null) {
      window.clearTimeout(closeTimeoutRef.current);
      closeTimeoutRef.current = null;
    }
  }, []);

  const scheduleClose = React.useCallback(() => {
    clearCloseTimeout();
    closeTimeoutRef.current = window.setTimeout(() => {
      setIsThumbOverflowOpen(false);
    }, 120);
  }, [clearCloseTimeout]);

  React.useEffect(() => {
    if (variant !== "thumb") return;

    // During active dnd-kit drags, avoid hover-intent churn from pointer moves.
    if (isDndDragging) {
      setIsThumbOverflowOpen(false);
      setIsThumbMoreReady(false);
      clearMoreDelayTimeout();
      clearCloseTimeout();
      return;
    }

    if (!isHovered) {
      setIsThumbOverflowOpen(false);
      setIsThumbMoreReady(false);
      clearMoreDelayTimeout();
      clearCloseTimeout();
      return;
    }

    setIsThumbMoreReady(false);
    scheduleMoreReady();

    return () => {
      clearMoreDelayTimeout();
    };
  }, [
    variant,
    isHovered,
    isDndDragging,
    scheduleMoreReady,
    clearMoreDelayTimeout,
    clearCloseTimeout,
  ]);

  React.useEffect(() => {
    return () => {
      clearMoreDelayTimeout();
      clearCloseTimeout();
    };
  }, [clearMoreDelayTimeout, clearCloseTimeout]);

  React.useImperativeHandle(
    ref,
    () => ({
      notifyPointerMove: () => {
        if (variant !== "thumb") return;
        if (isDndDragging) return;
        if (!isHovered) return;
        if (isThumbOverflowOpen) return;

        if (isThumbMoreReady) setIsThumbMoreReady(false);
        scheduleMoreReady();
      },
    }),
    [
      variant,
      isHovered,
      isDndDragging,
      isThumbOverflowOpen,
      isThumbMoreReady,
      scheduleMoreReady,
    ]
  );

  const defaultActionLabels: Record<keyof SlotControls, string> = {
    upload: "Upload",
    paste: "Paste from Clipboard",
    copy: "Copy to Clipboard",
    download: "Download",
    remove: "Remove image",
  };

  const coreActionsRaw = [
    {
      key: "upload",
      icon: Icons.Upload,
      title: actionLabels?.upload ?? defaultActionLabels.upload,
      onClick: onUploadClick,
      isVisible: controls.upload && supportsUpload,
    },
    {
      key: "paste",
      icon: Icons.Paste,
      title: actionLabels?.paste ?? defaultActionLabels.paste,
      onClick: onPaste,
      isVisible: controls.paste && supportsUpload,
    },
    {
      key: "copy",
      icon: Icons.Copy,
      title: actionLabels?.copy ?? defaultActionLabels.copy,
      onClick: onCopy,
      isVisible: controls.copy && !!image,
    },
    {
      key: "download",
      icon: Icons.Download,
      title: actionLabels?.download ?? defaultActionLabels.download,
      onClick: onDownload,
      isVisible: controls.download && !!image,
    },
    {
      key: "remove",
      icon: Icons.X,
      title: actionLabels?.remove ?? defaultActionLabels.remove,
      onClick: onRemove,
      isVisible: controls.remove && !!image && supportsRemove,
    },
  ] satisfies SlotActionButton[];

  const coreActions = coreActionsRaw.filter(
    (action) => action.isVisible && !disabled
  );

  const infoAction: SlotActionButton | null =
    image && !disabled
      ? {
          key: "info",
          icon: Icons.Info,
          title: "Image info",
          onClick: onOpenInfo,
          testId: "image-info-button",
        }
      : null;

  const actionsWithInfo =
    variant !== "panel" && infoAction
      ? [...coreActions, infoAction]
      : coreActions;

  // Keep the X (remove) action at the end for consistent left-to-right / top-to-bottom ordering.
  const orderedActions = moveRemoveToEnd(actionsWithInfo);

  const shouldShowMagnifierToggle = variant === "panel" && !!image && !disabled;

  const panelActions = shouldShowMagnifierToggle
    ? insertBeforeRemove(orderedActions, {
        key: "magnifier",
        icon: Icons.Magnifier,
        title: isMagnifierPinned ? "Disable magnifier" : "Enable magnifier",
        onClick: onToggleMagnifier,
        ariaPressed: isMagnifierPinned,
        isActive: isMagnifierPinned,
        testId: "image-slot-magnifier-toggle",
      } satisfies SlotActionButton)
    : orderedActions;

  const renderActionButton = (
    action: SlotActionButton,
    sxOverride?: SxProps<MuiTheme>
  ) => {
    const isActive = action.isActive ?? false;
    const usesTooltip = action.key === "info" && !!image;

    const baseSx: SxProps<MuiTheme> = {
      p: `${buttonPadding}px`,
      borderRadius: "50%",
      border: "none",
      bgcolor: isActive ? theme.colors.accent : theme.colors.overlay,
      color: isActive ? theme.colors.appBackground : theme.colors.textPrimary,
      boxShadow: theme.colors.panelShadow,
      backdropFilter: "blur(6px)",
      transition:
        "background-color 120ms ease, color 120ms ease, transform 70ms ease, filter 120ms ease",
      WebkitTapHighlightColor: "transparent",
      "&:hover": {
        filter: "brightness(1.08)",
      },
      "&:active": {
        transform: "translateY(1px)",
      },
      "&.Mui-focusVisible": {
        filter: "brightness(1.1)",
      },
      "&.Mui-disabled": {
        opacity: 0.45,
      },
    };

    const buttonNode = (
      <IconButton
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          action.onClick();
        }}
        data-testid={action.testId}
        sx={[baseSx, sxOverride] as SxProps<MuiTheme>}
        title={usesTooltip ? undefined : action.title}
        aria-label={action.title}
        aria-pressed={
          typeof action.ariaPressed === "boolean"
            ? action.ariaPressed
            : undefined
        }
      >
        <Icon path={action.icon} width={iconSize} height={iconSize} />
      </IconButton>
    );

    if (usesTooltip) {
      return (
        <Tooltip
          key={action.key}
          placement="top"
          enterDelay={150}
          title={
            <div data-testid="image-info-tooltip">
              <ImageInfoPanel item={image} />
            </div>
          }
          slotProps={{
            tooltip: {
              sx: {
                maxWidth: "min(360px, calc(100vw - 32px))",
              },
            },
          }}
        >
          {buttonNode}
        </Tooltip>
      );
    }

    return <React.Fragment key={action.key}>{buttonNode}</React.Fragment>;
  };

  if (placement === "header") {
    if (variant !== "panel" || !isHovered) return null;

    return (
      <>
        {infoAction ? renderActionButton(infoAction) : null}
        {panelActions.map((action) => renderActionButton(action))}
      </>
    );
  }

  // overlay placement
  if (variant === "tile") {
    const shouldShowActions = isHovered && orderedActions.length > 0;
    if (!shouldShowActions) return null;

    return (
      <div
        style={{
          position: "absolute",
          top: cornerOffset,
          right: cornerOffset,
          display: "flex",
          flexDirection: "column",
          gap: 4,
          zIndex: 20,
          pointerEvents: disabled ? "none" : "auto",
        }}
      >
        {orderedActions.map((action) => renderActionButton(action))}
      </div>
    );
  }

  if (variant === "thumb") {
    if (!image || disabled || orderedActions.length === 0) return null;

    const removeAction = orderedActions.find(
      (action) => action.key === "remove"
    );
    const overflowActions = orderedActions.filter(
      (action) => action.key !== "remove"
    );

    const showRemove = isHovered;
    const showMoreTrigger =
      overflowActions.length > 0 &&
      ((isHovered && isThumbMoreReady) || isThumbOverflowOpen);

    return (
      <>
        {removeAction ? (
          <div
            style={{
              position: "absolute",
              top: cornerOffset,
              right: cornerOffset,
              display: "flex",
              flexDirection: "column",
              gap: 4,
              zIndex: 20,
              pointerEvents: disabled ? "none" : "auto",
            }}
          >
            {renderActionButton(removeAction, {
              opacity: showRemove ? 1 : 0,
              pointerEvents: showRemove ? "auto" : "none",
              transition: "opacity 120ms ease",
            })}
          </div>
        ) : null}

        {overflowActions.length > 0 ? (
          <div
            style={{
              position: "absolute",
              bottom: cornerOffset,
              left: cornerOffset,
              zIndex: 20,
              pointerEvents: disabled ? "none" : "auto",
            }}
          >
            <ClickAwayListener
              onClickAway={() => {
                setIsThumbOverflowOpen(false);
              }}
            >
              <div
                onMouseEnter={() => {
                  if (!isThumbOverflowOpen) return;
                  clearCloseTimeout();
                }}
                onMouseLeave={() => {
                  scheduleClose();
                }}
                onFocusCapture={() => {
                  if (!isThumbOverflowOpen) return;
                  clearCloseTimeout();
                }}
                onBlurCapture={(event) => {
                  const next = event.relatedTarget as Node | null;
                  if (!next || !event.currentTarget.contains(next)) {
                    scheduleClose();
                  }
                }}
                style={{
                  position: "relative",
                  pointerEvents:
                    showMoreTrigger || isThumbOverflowOpen ? "auto" : "none",
                }}
              >
                <IconButton
                  ref={(node) => {
                    moreButtonRef.current = node;
                  }}
                  type="button"
                  tabIndex={showMoreTrigger ? 0 : -1}
                  aria-label="More actions"
                  title="More actions"
                  onClick={(event) => {
                    event.stopPropagation();
                    clearCloseTimeout();
                    setIsThumbOverflowOpen((open) => !open);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.stopPropagation();
                      setIsThumbOverflowOpen(false);
                    }
                  }}
                  sx={{
                    p: `${buttonPadding}px`,
                    borderRadius: "50%",
                    border: "none",
                    bgcolor: theme.colors.overlay,
                    color: theme.colors.textPrimary,
                    boxShadow: theme.colors.panelShadow,
                    backdropFilter: "blur(6px)",
                    transition:
                      "opacity 120ms ease, transform 70ms ease, filter 120ms ease",
                    opacity: showMoreTrigger ? 1 : 0,
                    pointerEvents: showMoreTrigger ? "auto" : "none",
                    WebkitTapHighlightColor: "transparent",
                    "&:hover": {
                      filter: "brightness(1.08)",
                    },
                    "&:active": {
                      transform: "translateY(1px)",
                    },
                    "&.Mui-focusVisible": {
                      filter: "brightness(1.1)",
                    },
                  }}
                >
                  <Icon path={Icons.More} width={iconSize} height={iconSize} />
                </IconButton>

                <Popper
                  open={isThumbOverflowOpen}
                  anchorEl={moreButtonRef.current}
                  placement="right-end"
                  style={{ zIndex: 60 }}
                  modifiers={[
                    {
                      name: "offset",
                      options: { offset: [0, 0] },
                    },
                  ]}
                >
                  <div
                    onMouseEnter={() => {
                      clearCloseTimeout();
                    }}
                    onMouseLeave={() => {
                      scheduleClose();
                    }}
                    onFocusCapture={() => {
                      clearCloseTimeout();
                    }}
                    onBlurCapture={(event) => {
                      const next = event.relatedTarget as Node | null;
                      if (!next || !event.currentTarget.contains(next)) {
                        scheduleClose();
                      }
                    }}
                    style={{
                      border: `1px solid ${theme.colors.panelBorder}`,
                      borderRadius: 999,
                      backgroundColor: theme.colors.overlay,
                      boxShadow: theme.colors.panelShadow,
                      backdropFilter: "blur(6px)",
                      display: "flex",
                      flexDirection: "row",
                      gap: 4,
                      alignItems: "center",
                      justifyContent: "flex-start",
                      padding: 4,
                      paddingLeft: 8,
                      transition: "opacity 140ms ease, transform 140ms ease",
                      opacity: isThumbOverflowOpen ? 1 : 0,
                      transform: isThumbOverflowOpen
                        ? "translateX(0)"
                        : "translateX(-10px)",
                      pointerEvents: isThumbOverflowOpen ? "auto" : "none",
                    }}
                  >
                    {overflowActions.map((action) =>
                      renderActionButton(action)
                    )}
                  </div>
                </Popper>
              </div>
            </ClickAwayListener>
          </div>
        ) : null}
      </>
    );
  }

  return null;
});
