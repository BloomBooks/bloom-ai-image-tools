import React from "react";
import { ClickAwayListener, IconButton, Popper, Tooltip } from "@mui/material";
import type { SxProps, Theme as MuiTheme } from "@mui/material/styles";
import { ImageRecord, ImageSlotActionKey } from "../types";
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

type SlotActionKey = ImageSlotActionKey | "info" | "magnifier" | "more";

type SlotActionButton = {
  key: SlotActionKey;
  icon: string;
  title: string;
  onClick: () => void;
  disabled?: boolean;
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

const insertBeforeRemove = (actions: SlotActionButton[], actionToInsert: SlotActionButton) => {
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
  actionDisabledReasons?: Partial<Record<ImageSlotActionKey, string>>;
  removeIcon?: string;
  iconSize: number;
  buttonPadding: number;
  cornerOffset: number;
  isAnyDndDragging?: boolean;
  isMagnifierPinned: boolean;
  onUploadClick: () => void;
  onPaste: () => void;
  onCopy: () => void;
  onDownload: () => void;
  onRemove: () => void;
  onOpenInfo: () => void;
  onToggleMagnifier: () => void;
};

export const ImageSlotActions = React.forwardRef<ImageSlotActionsHandle, ImageSlotActionsProps>(
  function ImageSlotActions(props, ref) {
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
      actionDisabledReasons,
      removeIcon,
      iconSize,
      buttonPadding,
      cornerOffset,
      isAnyDndDragging = false,
      isMagnifierPinned,
      onUploadClick,
      onPaste,
      onCopy,
      onDownload,
      onRemove,
      onOpenInfo,
      onToggleMagnifier,
    } = props;

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
      if (isAnyDndDragging) {
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
      isAnyDndDragging,
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
          if (isAnyDndDragging) return;
          if (!isHovered) return;
          if (isThumbOverflowOpen) return;

          if (isThumbMoreReady) setIsThumbMoreReady(false);
          scheduleMoreReady();
        },
      }),
      [
        variant,
        isHovered,
        isAnyDndDragging,
        isThumbOverflowOpen,
        isThumbMoreReady,
        scheduleMoreReady,
      ],
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
        icon: removeIcon ?? Icons.X,
        title: actionDisabledReasons?.remove ?? actionLabels?.remove ?? defaultActionLabels.remove,
        onClick: onRemove,
        disabled: Boolean(actionDisabledReasons?.remove),
        isVisible: controls.remove && !!image && supportsRemove,
      },
    ] satisfies SlotActionButton[];

    const coreActions = coreActionsRaw.filter((action) => action.isVisible && !disabled);

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
      variant !== "panel" && infoAction ? [...coreActions, infoAction] : coreActions;

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

    const renderActionButton = (action: SlotActionButton, sxOverride?: SxProps<MuiTheme>) => {
      const isActive = action.isActive ?? false;
      const usesInfoTooltip = action.key === "info" && !!image;
      const tooltipTitle = usesInfoTooltip ? (
        <div data-testid="image-info-tooltip">
          <ImageInfoPanel item={image} />
        </div>
      ) : action.disabled ? (
        action.title
      ) : null;

      const baseSx: SxProps<MuiTheme> = {
        p: `${buttonPadding}px`,
        borderRadius: "50%",
        border: "none",
        bgcolor: isActive ? theme.colors.accent : theme.colors.overlay,
        backgroundColor: isActive ? theme.colors.accent : theme.colors.overlay,
        color: isActive ? theme.colors.appBackground : theme.colors.textPrimary,
        boxShadow: theme.colors.panelShadow,
        backdropFilter: "blur(6px)",
        transition:
          "background-color 120ms ease, color 120ms ease, transform 70ms ease, filter 120ms ease",
        WebkitTapHighlightColor: "transparent",
        "&:hover": {
          bgcolor: isActive ? theme.colors.accent : theme.colors.overlay,
          backgroundColor: isActive ? theme.colors.accent : theme.colors.overlay,
          color: isActive ? theme.colors.appBackground : theme.colors.textPrimary,
          filter: "brightness(1.08)",
        },
        "&:active": {
          bgcolor: isActive ? theme.colors.accent : theme.colors.overlay,
          backgroundColor: isActive ? theme.colors.accent : theme.colors.overlay,
          color: isActive ? theme.colors.appBackground : theme.colors.textPrimary,
          transform: "translateY(1px)",
        },
        "&.Mui-focusVisible": {
          bgcolor: isActive ? theme.colors.accent : theme.colors.overlay,
          backgroundColor: isActive ? theme.colors.accent : theme.colors.overlay,
          color: isActive ? theme.colors.appBackground : theme.colors.textPrimary,
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
            if (action.disabled) return;
            action.onClick();
          }}
          disabled={action.disabled}
          data-testid={action.testId}
          sx={[baseSx, sxOverride] as SxProps<MuiTheme>}
          title={tooltipTitle ? undefined : action.title}
          aria-label={action.title}
          aria-pressed={typeof action.ariaPressed === "boolean" ? action.ariaPressed : undefined}
        >
          <Icon path={action.icon} width={iconSize} height={iconSize} />
        </IconButton>
      );

      if (tooltipTitle) {
        return (
          <Tooltip
            key={action.key}
            placement="top"
            enterDelay={150}
            title={tooltipTitle}
            slotProps={
              usesInfoTooltip
                ? {
                    tooltip: {
                      sx: {
                        maxWidth: "min(360px, calc(100vw - 32px))",
                      },
                    },
                  }
                : undefined
            }
          >
            <span style={{ display: "inline-flex" }}>{buttonNode}</span>
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
      const tileActionOrder: Record<SlotActionKey, number> = {
        info: 0,
        copy: 1,
        paste: 2,
        upload: 3,
        download: 4,
        remove: 5,
        magnifier: 6,
        more: 7,
      };
      const removeAction = orderedActions.find((action) => action.key === "remove");
      const primaryActions = orderedActions
        .filter((action) => action.key !== "remove")
        .sort((left, right) => tileActionOrder[left.key] - tileActionOrder[right.key]);

      const shouldShowActions = isHovered && (primaryActions.length > 0 || !!removeAction);
      if (!shouldShowActions) return null;

      return (
        <>
          {primaryActions.length > 0 ? (
            <div
              style={{
                position: "absolute",
                top: cornerOffset,
                left: cornerOffset,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                zIndex: 20,
                pointerEvents: disabled ? "none" : "auto",
              }}
            >
              {primaryActions.map((action) => renderActionButton(action))}
            </div>
          ) : null}

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
              {renderActionButton(removeAction)}
            </div>
          ) : null}
        </>
      );
    }

    if (variant === "thumb") {
      if (!image || disabled || orderedActions.length === 0) return null;

      const removeAction = orderedActions.find((action) => action.key === "remove");
      // Surface copy as a dedicated, always-on-hover button (rather than burying
      // it in the "..." overflow) so a single hover-click copies the thumbnail.
      const copyAction = orderedActions.find((action) => action.key === "copy");
      const overflowActions = orderedActions.filter(
        (action) => action.key !== "remove" && action.key !== "copy",
      );

      const showRemove = isHovered;
      const showCopy = isHovered;
      const showMoreTrigger =
        overflowActions.length > 0 && ((isHovered && isThumbMoreReady) || isThumbOverflowOpen);

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
                opacity: showRemove ? 1 : 0,
                pointerEvents: disabled ? "none" : showRemove ? "auto" : "none",
                transition: "opacity 120ms ease",
              }}
            >
              {renderActionButton(removeAction)}
            </div>
          ) : null}

          {copyAction ? (
            <div
              style={{
                position: "absolute",
                bottom: cornerOffset,
                right: cornerOffset,
                display: "flex",
                flexDirection: "column",
                gap: 4,
                zIndex: 20,
                opacity: showCopy ? 1 : 0,
                pointerEvents: disabled ? "none" : showCopy ? "auto" : "none",
                transition: "opacity 120ms ease",
              }}
            >
              {renderActionButton(copyAction)}
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
                    pointerEvents: showMoreTrigger || isThumbOverflowOpen ? "auto" : "none",
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
                      backgroundColor: theme.colors.overlay,
                      color: theme.colors.textPrimary,
                      boxShadow: theme.colors.panelShadow,
                      backdropFilter: "blur(6px)",
                      transition: "opacity 120ms ease, transform 70ms ease, filter 120ms ease",
                      opacity: showMoreTrigger ? 1 : 0,
                      pointerEvents: showMoreTrigger ? "auto" : "none",
                      WebkitTapHighlightColor: "transparent",
                      "&:hover": {
                        bgcolor: theme.colors.overlay,
                        backgroundColor: theme.colors.overlay,
                        color: theme.colors.textPrimary,
                        filter: "brightness(1.08)",
                      },
                      "&:active": {
                        bgcolor: theme.colors.overlay,
                        backgroundColor: theme.colors.overlay,
                        color: theme.colors.textPrimary,
                        transform: "translateY(1px)",
                      },
                      "&.Mui-focusVisible": {
                        bgcolor: theme.colors.overlay,
                        backgroundColor: theme.colors.overlay,
                        color: theme.colors.textPrimary,
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
                        transform: isThumbOverflowOpen ? "translateX(0)" : "translateX(-10px)",
                        pointerEvents: isThumbOverflowOpen ? "auto" : "none",
                      }}
                    >
                      {overflowActions.map((action) => renderActionButton(action))}
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
  },
);
