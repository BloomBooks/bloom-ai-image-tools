import React, { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Box, Button, Stack, Typography } from "@mui/material";
import type { ArtStyle } from "../../types";
import { theme } from "../../themes";
import {
  CLEAR_ART_STYLE_ID,
  loadArtStylePreviewUrl,
} from "../../lib/artStyles";

const DIALOG_MAX_WIDTH = "min(1000px, 92vw)";
const DIALOG_MAX_HEIGHT = "min(900px, 90vh)";
const SELECTED_CARD_BACKGROUND = "rgba(29, 148, 164, 0.16)";

interface ArtStyleChooserDialogProps {
  isOpen: boolean;
  styles: ArtStyle[];
  selectedId?: string;
  onSelect: (styleId: string) => void;
  onClose: () => void;
}

export const ArtStyleChooserDialog: React.FC<ArtStyleChooserDialogProps> = ({
  isOpen,
  styles,
  selectedId,
  onSelect,
  onClose,
}) => {
  // Keep the "None" option pinned to the top of the list for quick access.
  const displayStyles = useMemo(() => {
    if (!styles.length) return styles;
    const noneStyle = styles.find((style) => style.id === CLEAR_ART_STYLE_ID);
    if (!noneStyle) return styles;
    const rest = styles.filter((style) => style.id !== CLEAR_ART_STYLE_ID);
    return [noneStyle, ...rest];
  }, [styles]);

  const hasNoneOption = displayStyles.some(
    (style) => style.id === CLEAR_ART_STYLE_ID
  );
  const normalizedSelectedId = selectedId?.length
    ? selectedId
    : hasNoneOption
    ? CLEAR_ART_STYLE_ID
    : undefined;

  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const previewCacheRef = useRef<Map<string, string>>(new Map());
  const [, setPreviewCacheVersion] = useState(0);

  // Resolve previews lazily: local assets are only imported when the dialog opens.
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    const pending: ArtStyle[] = [];
    let hasSyncUpdates = false;

    displayStyles.forEach((style) => {
      if (previewCacheRef.current.has(style.id)) {
        return;
      }
      if (style.previewUrl) {
        previewCacheRef.current.set(style.id, style.previewUrl);
        hasSyncUpdates = true;
        return;
      }
      pending.push(style);
    });

    if (hasSyncUpdates) {
      setPreviewCacheVersion((value) => value + 1);
    }

    pending.forEach((style) => {
      loadArtStylePreviewUrl(style)
        .then((url) => {
          if (!cancelled && url) {
            previewCacheRef.current.set(style.id, url);
            setPreviewCacheVersion((value) => value + 1);
          }
        })
        .catch(() => {
          /* ignore */
        });
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, displayStyles]);

  useEffect(() => {
    if (!isOpen || !normalizedSelectedId) return;
    const container = scrollAreaRef.current;
    if (!container) return;
    const buttons =
      container.querySelectorAll<HTMLButtonElement>("[data-style-id]");
    for (const button of buttons) {
      if (button.dataset.styleId === normalizedSelectedId) {
        button.scrollIntoView({ behavior: "smooth", block: "center" });
        break;
      }
    }
  }, [isOpen, normalizedSelectedId]);

  if (!isOpen) return null;

  const handleSelect = (styleId: string) => {
    onSelect(styleId);
    onClose();
  };

  const dialogContent = (
    <Box
      sx={{
        position: "fixed",
        inset: 0,
        zIndex: 80,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflowY: "auto",
        p: { xs: 2, sm: 4 },
      }}
    >
      <Box
        sx={{
          position: "absolute",
          inset: 0,
          backgroundColor: theme.colors.overlayStrong,
        }}
        onClick={onClose}
      />
      <Box
        sx={{
          position: "relative",
          mx: 2,
          width: DIALOG_MAX_WIDTH,
          maxHeight: DIALOG_MAX_HEIGHT,
          backgroundColor: theme.colors.surface,
          borderRadius: 4,
          overflow: "hidden",
          border: `1px solid ${theme.colors.border}`,
          boxShadow: theme.colors.panelShadow,
        }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="art-style-dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <Box
          sx={{
            display: "flex",
            flexDirection: "column",
            height: "100%",
            maxHeight: DIALOG_MAX_HEIGHT,
            minHeight: 0,
            background: "linear-gradient(135deg, #0e1729, #111c31)",
            color: theme.colors.textPrimary,
          }}
        >
          <Box
            component="header"
            sx={{
              p: 4,
              borderBottom: `1px solid ${theme.colors.border}`,
            }}
          >
            <Stack
              direction="row"
              spacing={2}
              alignItems="center"
              justifyContent="space-between"
            >
              <Typography
                id="art-style-dialog-title"
                variant="h5"
                sx={{ fontWeight: 600, mt: 1, color: theme.colors.textPrimary }}
              >
                Choose an Art Style
              </Typography>
              <Button
                variant="outlined"
                size="small"
                onClick={onClose}
                sx={{ borderRadius: "999px" }}
              >
                Close
              </Button>
            </Stack>
          </Box>
          <Box
            sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 4 }}
            ref={scrollAreaRef}
          >
            <Box
              sx={{
                display: "grid",
                gap: 3,
                gridTemplateColumns: {
                  xs: "repeat(2, minmax(0, 1fr))",
                  md: "repeat(3, minmax(0, 1fr))",
                  xl: "repeat(4, minmax(0, 1fr))",
                },
              }}
            >
              {displayStyles.map((style) => {
                const isSelected = normalizedSelectedId
                  ? style.id === normalizedSelectedId
                  : false;
                const previewSrc = previewCacheRef.current.get(style.id);
                const hasPreviewSource = Boolean(
                  style.previewUrl || style.previewAssetKey
                );
                return (
                  <Box
                    key={style.id}
                    data-style-id={style.id}
                    onClick={() => handleSelect(style.id)}
                    component="button"
                    sx={{
                      display: "flex",
                      flexDirection: "column",
                      textAlign: "left",
                      borderRadius: 3,
                      border: `3px solid ${
                        isSelected ? theme.colors.accent : theme.colors.border
                      }`,
                      overflow: "hidden",
                      backgroundColor: isSelected
                        ? SELECTED_CARD_BACKGROUND
                        : theme.colors.surfaceAlt,
                      p: "5px",
                      transition: "transform 120ms ease",
                      cursor: "pointer",
                      color: theme.colors.textPrimary,
                      "&:hover": {
                        backgroundColor: SELECTED_CARD_BACKGROUND,
                      },
                    }}
                  >
                    <Box
                      sx={{
                        position: "relative",
                        width: "100%",
                        paddingBottom: "100%",
                        borderRadius: 2,
                        overflow: "hidden",
                      }}
                    >
                      {/* Preview image resolves once the dialog is visible to avoid eager network requests. */}
                      {previewSrc ? (
                        <img
                          src={previewSrc}
                          alt={`${style.name} preview`}
                          style={{
                            position: "absolute",
                            inset: 0,
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            borderRadius: "inherit",
                          }}
                          loading="lazy"
                        />
                      ) : (
                        <Box
                          sx={{
                            position: "absolute",
                            inset: 0,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: "0.75rem",
                            color: theme.colors.textSecondary,
                          }}
                        >
                          {hasPreviewSource ? "Loading preview" : "No preview"}
                        </Box>
                      )}
                    </Box>
                    <Box
                      sx={{
                        p: 3,
                        display: "flex",
                        flexDirection: "column",
                        gap: 1.5,
                      }}
                    >
                      <Stack direction="row" spacing={1} alignItems="center">
                        <Typography
                          variant="subtitle1"
                          fontWeight={600}
                          flex={1}
                        >
                          {style.name}
                        </Typography>
                      </Stack>
                      <Typography
                        variant="body2"
                        sx={{
                          color: theme.colors.textSecondary,
                          lineHeight: 1.4,
                        }}
                      >
                        {style.description || style.promptDetail}
                      </Typography>
                    </Box>
                  </Box>
                );
              })}
            </Box>
          </Box>
        </Box>
      </Box>
    </Box>
  );

  if (typeof document === "undefined") {
    return dialogContent;
  }

  return createPortal(dialogContent, document.body);
};
