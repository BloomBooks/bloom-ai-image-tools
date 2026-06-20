import React from "react";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import ListItemIcon from "@mui/material/ListItemIcon";
import ListItemText from "@mui/material/ListItemText";
import { theme } from "../themes";
import { Icon, Icons, PasteIcon } from "./Icons";

const MENU_ICON_SIZE = 16;

type EditableElement = HTMLInputElement | HTMLTextAreaElement;

// Input types that behave like a text box (everything else — file, checkbox,
// radio, range, color, button, etc. — gets the browser's native menu).
const TEXT_INPUT_TYPES = new Set([
  "text",
  "search",
  "url",
  "tel",
  "password",
  "email",
  "number",
  "",
]);

const getEditableTarget = (target: EventTarget | null): EditableElement | null => {
  if (target instanceof HTMLTextAreaElement) return target;
  if (target instanceof HTMLInputElement) {
    const type = (target.getAttribute("type") || "").toLowerCase();
    if (TEXT_INPUT_TYPES.has(type)) return target;
  }
  return null;
};

// React tracks the input value via its own descriptor, so a plain `el.value = x`
// is invisible to controlled components. Go through the native setter and fire
// an `input` event so onChange handlers run.
const setReactInputValue = (el: EditableElement, value: string) => {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  // The setter is invoked via `.call(el, ...)` below, so `this` is bound correctly.
  // eslint-disable-next-line @typescript-eslint/unbound-method
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
  if (setter) {
    setter.call(el, value);
  } else {
    el.value = value;
  }
  el.dispatchEvent(new Event("input", { bubbles: true }));
};

const replaceSelection = (el: EditableElement, start: number, end: number, insert: string) => {
  const current = el.value;
  const next = current.slice(0, start) + insert + current.slice(end);
  setReactInputValue(el, next);
  const caret = start + insert.length;
  try {
    el.setSelectionRange(caret, caret);
  } catch {
    // Some input types (e.g. number) disallow setSelectionRange — ignore.
  }
};

interface MenuState {
  x: number;
  y: number;
  target: EditableElement;
  selStart: number;
  selEnd: number;
  isEditable: boolean;
  hasValue: boolean;
}

/**
 * Mount once near the app root. Adds a Cut / Copy / Paste / Select All
 * right-click menu to every text box (`<input>` / `<textarea>`) in the app,
 * styled to match the rest of the UI.
 */
export const TextFieldContextMenu: React.FC = () => {
  const [menu, setMenu] = React.useState<MenuState | null>(null);
  const [canPaste, setCanPaste] = React.useState(true);

  React.useEffect(() => {
    const handleContextMenu = (event: MouseEvent) => {
      const target = getEditableTarget(event.target);
      if (!target) return;

      event.preventDefault();

      const start = target.selectionStart ?? 0;
      const end = target.selectionEnd ?? 0;
      const isEditable = !target.disabled && !target.readOnly;

      setMenu({
        x: event.clientX,
        y: event.clientY,
        target,
        selStart: start,
        selEnd: end,
        isEditable,
        hasValue: target.value.length > 0,
      });
    };

    document.addEventListener("contextmenu", handleContextMenu);
    return () => document.removeEventListener("contextmenu", handleContextMenu);
  }, []);

  // Probe clipboard availability when the menu opens so Paste can be disabled
  // when there's nothing readable (and in browsers without clipboard read).
  React.useEffect(() => {
    if (!menu) return;
    let cancelled = false;
    const probe = async () => {
      try {
        const text = await navigator.clipboard?.readText();
        if (!cancelled) setCanPaste(typeof text === "string" && text.length > 0);
      } catch {
        // Permission not granted / not supported — leave Paste enabled and let
        // the action itself surface any failure.
        if (!cancelled) setCanPaste(true);
      }
    };
    void probe();
    return () => {
      cancelled = true;
    };
  }, [menu]);

  const close = () => setMenu(null);

  const hasSelection = !!menu && menu.selEnd > menu.selStart;

  const runAndClose = (action: () => void | Promise<void>) => () => {
    close();
    void action();
  };

  const handleCopy = async () => {
    if (!menu || !hasSelection) return;
    const selected = menu.target.value.slice(menu.selStart, menu.selEnd);
    try {
      await navigator.clipboard?.writeText(selected);
    } catch (err) {
      console.error("Copy failed:", err);
    }
  };

  const handleCut = async () => {
    if (!menu || !hasSelection || !menu.isEditable) return;
    const { target, selStart, selEnd } = menu;
    const selected = target.value.slice(selStart, selEnd);
    try {
      await navigator.clipboard?.writeText(selected);
    } catch (err) {
      console.error("Cut failed:", err);
      return;
    }
    target.focus();
    replaceSelection(target, selStart, selEnd, "");
  };

  const handlePaste = async () => {
    if (!menu || !menu.isEditable) return;
    const { target, selStart, selEnd } = menu;
    let text = "";
    try {
      text = (await navigator.clipboard?.readText()) ?? "";
    } catch (err) {
      console.error("Paste failed:", err);
      return;
    }
    if (!text) return;
    target.focus();
    replaceSelection(target, selStart, selEnd, text);
  };

  const handleSelectAll = () => {
    if (!menu) return;
    menu.target.focus();
    try {
      menu.target.setSelectionRange(0, menu.target.value.length);
    } catch {
      menu.target.select();
    }
  };

  const menuItemSx = {
    padding: "6px 12px",
    fontSize: "0.85rem",
    color: theme.colors.textPrimary,
    borderRadius: 1,
    "&:hover": {
      backgroundColor: theme.colors.surfaceAlt,
    },
  } as const;

  const iconSx = {
    minWidth: 0,
    marginRight: "10px",
    color: theme.colors.textPrimary,
  } as const;

  return (
    <Menu
      data-testid="text-field-context-menu"
      open={menu !== null}
      onClose={close}
      anchorReference="anchorPosition"
      anchorPosition={menu !== null ? { top: menu.y, left: menu.x } : undefined}
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
        data-testid="text-context-menu-cut"
        onClick={runAndClose(handleCut)}
        disabled={!hasSelection || !menu?.isEditable}
        sx={menuItemSx}
      >
        <ListItemIcon sx={iconSx}>
          <Icon path={Icons.Cut} width={MENU_ICON_SIZE} height={MENU_ICON_SIZE} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: "0.85rem" }}>Cut</ListItemText>
      </MenuItem>

      <MenuItem
        data-testid="text-context-menu-copy"
        onClick={runAndClose(handleCopy)}
        disabled={!hasSelection}
        sx={menuItemSx}
      >
        <ListItemIcon sx={iconSx}>
          <Icon path={Icons.Copy} width={MENU_ICON_SIZE} height={MENU_ICON_SIZE} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: "0.85rem" }}>Copy</ListItemText>
      </MenuItem>

      <MenuItem
        data-testid="text-context-menu-paste"
        onClick={runAndClose(handlePaste)}
        disabled={!menu?.isEditable || !canPaste}
        sx={menuItemSx}
      >
        <ListItemIcon sx={iconSx}>
          <PasteIcon width={MENU_ICON_SIZE} height={MENU_ICON_SIZE} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: "0.85rem" }}>Paste</ListItemText>
      </MenuItem>

      <MenuItem
        data-testid="text-context-menu-select-all"
        onClick={runAndClose(handleSelectAll)}
        disabled={!menu?.hasValue}
        sx={menuItemSx}
      >
        <ListItemIcon sx={iconSx}>
          <Icon path={Icons.SelectAll} width={MENU_ICON_SIZE} height={MENU_ICON_SIZE} />
        </ListItemIcon>
        <ListItemText primaryTypographyProps={{ fontSize: "0.85rem" }}>Select All</ListItemText>
      </MenuItem>
    </Menu>
  );
};
