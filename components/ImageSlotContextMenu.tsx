import React from "react";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import { theme } from "../themes";
import { Icon, Icons, PasteIcon } from "./Icons";

const MENU_ICON_SIZE = 16;

export interface ImageSlotContextMenuProps {
  contextMenu: { x: number; y: number } | null;
  onClose: () => void;
  canCopy: boolean;
  canPaste: boolean;
  onCopy: () => void;
  onPaste: () => void;
  canSetThumbnail?: boolean;
  onSetThumbnail?: () => void;
}

export const ImageSlotContextMenu: React.FC<ImageSlotContextMenuProps> = ({
  contextMenu,
  onClose,
  canCopy,
  canPaste,
  onCopy,
  onPaste,
  canSetThumbnail = false,
  onSetThumbnail,
}) => {
  const runAndClose = (action: () => void) => () => {
    onClose();
    action();
  };

  const menuItemSx = {
    padding: "6px 12px",
    fontSize: "0.85rem",
    color: theme.colors.textPrimary,
    borderRadius: 1,
  } as const;

  const iconSx = {
    minWidth: 0,
    marginRight: "10px",
    color: theme.colors.textPrimary,
  } as const;

  return (
    <Menu
      data-testid="image-slot-context-menu"
      open={contextMenu !== null}
      onClose={onClose}
      anchorReference="anchorPosition"
      anchorPosition={
        contextMenu !== null ? { top: contextMenu.y, left: contextMenu.x } : undefined
      }
      slotProps={{
        paper: {
          sx: {
            minWidth: 160,
            borderRadius: "12px",
            padding: "4px",
            backgroundColor: theme.colors.surfaceRaised,
            border: `1px solid ${theme.colors.border}`,
            boxShadow: theme.colors.panelShadow,
          },
        },
        list: { sx: { padding: 0 } },
      }}
    >
      <MenuItem
        data-testid="context-menu-copy"
        onClick={runAndClose(onCopy)}
        disabled={!canCopy}
        sx={menuItemSx}
      >
        <ListItemIcon sx={iconSx}>
          <Icon path={Icons.Copy} width={MENU_ICON_SIZE} height={MENU_ICON_SIZE} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: "0.85rem" }}>Copy</ListItemText>
      </MenuItem>

      <MenuItem
        data-testid="context-menu-paste"
        onClick={runAndClose(onPaste)}
        disabled={!canPaste}
        sx={menuItemSx}
      >
        <ListItemIcon sx={iconSx}>
          <PasteIcon width={MENU_ICON_SIZE} height={MENU_ICON_SIZE} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: "0.85rem" }}>Paste</ListItemText>
      </MenuItem>

      {canSetThumbnail && onSetThumbnail ? (
        <MenuItem
          data-testid="context-menu-set-thumbnail"
          onClick={runAndClose(onSetThumbnail)}
          sx={menuItemSx}
        >
          <ListItemIcon sx={iconSx}>
            <Icon path={Icons.Save} width={MENU_ICON_SIZE} height={MENU_ICON_SIZE} />
          </ListItemIcon>
          <ListItemText primaryTypographyProps={{ fontSize: "0.85rem" }}>
            Set thumbnail
          </ListItemText>
        </MenuItem>
      ) : null}
    </Menu>
  );
};
