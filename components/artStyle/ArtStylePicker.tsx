import React, { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Box, Stack, Typography, Button } from "@mui/material";
import type { ArtStyle } from "../../types";
import { theme } from "../../themes";
import {
  CLEAR_ART_STYLE_ID,
  loadArtStylePreviewUrl,
} from "../../lib/artStyles";

const LazyArtStyleChooserDialog = React.lazy(async () => {
  const module = await import("./ArtStyleChooserDialog");
  return { default: module.ArtStyleChooserDialog };
});

interface ArtStylePickerProps {
  styles: ArtStyle[];
  value?: string;
  onChange: (styleId: string) => void;
  disabled?: boolean;
  "data-testid"?: string;
}

type FreezeState = "idle" | "pending" | "ready" | "failed";

export const ArtStylePicker: React.FC<ArtStylePickerProps> = ({
  styles,
  value,
  onChange,
  disabled = false,
  "data-testid": dataTestId,
}) => {
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [hasOpenedDialog, setHasOpenedDialog] = useState(false);
  const frozenPreviewCacheRef = useRef<Map<string, string>>(new Map());
  const [selectedPreviewUrl, setSelectedPreviewUrl] = useState<string | null>(
    null
  );
  const [frozenPreview, setFrozenPreview] = useState<string | null>(null);
  const [freezeState, setFreezeState] = useState<FreezeState>("idle");
  const hasNoneOption = styles.some((style) => style.id === CLEAR_ART_STYLE_ID);
  const normalizedValue = value?.length
    ? value
    : hasNoneOption
    ? CLEAR_ART_STYLE_ID
    : value ?? "";

  const selected = useMemo(
    () => styles.find((style) => style.id === normalizedValue) || null,
    [styles, normalizedValue]
  );

  const handleOpen = () => {
    if (disabled) return;
    setHasOpenedDialog(true);
    setIsDialogOpen(true);
  };

  const handleClose = () => setIsDialogOpen(false);

  const handleSelect = (styleId: string) => {
    onChange(styleId);
  };

  useEffect(() => {
    let cancelled = false;
    if (!selected) {
      setSelectedPreviewUrl(null);
      return () => {
        cancelled = true;
      };
    }

    loadArtStylePreviewUrl(selected)
      .then((url) => {
        if (!cancelled) {
          setSelectedPreviewUrl(url ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSelectedPreviewUrl(null);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [selected]);

  const preview = selectedPreviewUrl;
  const shouldFreezePreview = isGifUrl(preview);

  useEffect(() => {
    // Avoid animated GIFs in the picker by capturing their first frame.
    if (!preview || !shouldFreezePreview) {
      setFrozenPreview(null);
      setFreezeState("idle");
      return;
    }

    const cache = frozenPreviewCacheRef.current;
    if (cache.has(preview)) {
      setFrozenPreview(cache.get(preview) ?? null);
      setFreezeState("ready");
      return;
    }

    let cancelled = false;
    setFreezeState("pending");
    const stillImage = new Image();
    stillImage.crossOrigin = "anonymous";
    stillImage.decoding = "async";

    stillImage.onload = () => {
      if (cancelled) return;
      try {
        const width = stillImage.naturalWidth || stillImage.width;
        const height = stillImage.naturalHeight || stillImage.height;
        if (!width || !height) {
          setFreezeState("failed");
          setFrozenPreview(null);
          return;
        }
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          setFreezeState("failed");
          setFrozenPreview(null);
          return;
        }
        ctx.drawImage(stillImage, 0, 0, width, height);
        const stillFrame = canvas.toDataURL("image/png");
        cache.set(preview, stillFrame);
        setFrozenPreview(stillFrame);
        setFreezeState("ready");
      } catch (err) {
        console.warn("Unable to freeze art style preview", err);
        setFrozenPreview(null);
        setFreezeState("failed");
      }
    };

    stillImage.onerror = () => {
      if (cancelled) return;
      setFrozenPreview(null);
      setFreezeState("failed");
    };

    stillImage.src = getCorsSafeImageUrl(preview);

    return () => {
      cancelled = true;
      stillImage.onload = null;
      stillImage.onerror = null;
    };
  }, [preview, shouldFreezePreview]);

  const displayPreview = shouldFreezePreview
    ? freezeState === "ready"
      ? frozenPreview
      : freezeState === "failed"
      ? preview
      : null
    : preview;

  return (
    <>
      <Stack direction="row" spacing={3} alignItems="center">
        <Button
          type="button"
          onClick={handleOpen}
          disabled={disabled}
          data-testid={dataTestId}
          variant="outlined"
          sx={{
            flex: 1,
            borderRadius: 3,
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceAlt,
            textTransform: "none",
            justifyContent: "flex-start",
            gap: 3,
            p: "10px",
            opacity: disabled ? 0.4 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
            color: theme.colors.textPrimary,
            "&:hover": {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
            },
          }}
        >
          <Box
            sx={{
              width: 56,
              height: 56,
              borderRadius: 2,
              overflow: "hidden",
              border: `1px solid ${theme.colors.borderMuted}`,
              flexShrink: 0,
            }}
          >
            {displayPreview && (
              <Box
                component="img"
                src={displayPreview}
                alt={
                  selected ? `${selected.name} preview` : "Art style preview"
                }
                sx={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            )}
          </Box>
          <Box sx={{ flex: 1 }}>
            <Typography
              variant="subtitle1"
              fontWeight={600}
              color={theme.colors.textPrimary}
            >
              {selected ? selected.name : "Choose an art style"}
            </Typography>
          </Box>
        </Button>
      </Stack>
      {hasOpenedDialog && (
        <Suspense fallback={null}>
          <LazyArtStyleChooserDialog
            isOpen={isDialogOpen}
            styles={styles}
            selectedId={value}
            onSelect={handleSelect}
            onClose={handleClose}
          />
        </Suspense>
      )}
    </>
  );
};

const GIF_EXTENSION_REGEX = /\.gif($|[?#])/i;

const isGifUrl = (value?: string | null): boolean =>
  typeof value === "string" && GIF_EXTENSION_REGEX.test(value);

const IMAGE_PROXY_BASE = "https://images.weserv.nl/?url=";

const getCorsSafeImageUrl = (source?: string | null): string => {
  if (!source) return "";
  try {
    const currentOrigin =
      typeof window !== "undefined" ? window.location.origin : "";
    const base = currentOrigin || "http://localhost";
    const parsed = new URL(source, base);
    const isHttpScheme =
      parsed.protocol === "http:" || parsed.protocol === "https:";
    if (!isHttpScheme) {
      return parsed.href;
    }
    if (!!currentOrigin && parsed.origin === currentOrigin) {
      return parsed.href;
    }
    const prefix = parsed.protocol === "https:" ? "ssl:" : "";
    const target = `${prefix}${parsed.host}${parsed.pathname}${parsed.search}`;
    return `${IMAGE_PROXY_BASE}${encodeURIComponent(target)}`;
  } catch {
    return source;
  }
};
