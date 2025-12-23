import React, { useEffect, useMemo, useRef, useState } from "react";
import type { ArtStyle } from "../../types";
import { theme } from "../../themes";
import { CLEAR_ART_STYLE_ID } from "../../lib/artStyles";
import { ArtStyleChooserDialog } from "./ArtStyleChooserDialog";

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
  const frozenPreviewCacheRef = useRef<Map<string, string>>(new Map());
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
    setIsDialogOpen(true);
  };

  const handleClose = () => setIsDialogOpen(false);

  const handleSelect = (styleId: string) => {
    onChange(styleId);
  };

  const preview = selected?.previewUrl;
  const supportingText = selected?.description || selected?.promptDetail;
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
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="flex-1 rounded-2xl border p-3 flex items-center gap-3 text-left"
          onClick={handleOpen}
          disabled={disabled}
          data-testid={dataTestId}
          style={{
            borderColor: theme.colors.border,
            backgroundColor: theme.colors.surfaceAlt,
            opacity: disabled ? 0.4 : 1,
            cursor: disabled ? "not-allowed" : "pointer",
          }}
        >
          <div
            className="w-14 h-14 rounded-xl overflow-hidden flex-shrink-0 border"
            style={{ borderColor: theme.colors.borderMuted }}
          >
            {displayPreview ? (
              <img
                src={displayPreview}
                alt={
                  selected ? `${selected.name} preview` : "Art style preview"
                }
                className="w-full h-full object-cover"
              />
            ) : (
              <div
                className="w-full h-full flex items-center justify-center text-[11px] px-1 text-center"
                style={{ color: theme.colors.textSecondary }}
              >
                No preview
              </div>
            )}
          </div>
          <div className="flex-1">
            {/* <p
              className="text-xs uppercase tracking-[0.3em] mb-1"
              style={{ color: theme.colors.textMuted }}
            >
              Style
            </p> */}
            <p
              className="font-semibold"
              style={{ color: theme.colors.textPrimary }}
            >
              {selected ? selected.name : "Choose an art style"}
            </p>
            <p
              className="text-xs"
              style={{ color: theme.colors.textSecondary }}
            >
              {/* {supportingText || "Set the vibe for this image."} */}
            </p>
          </div>
        </button>
      </div>
      <ArtStyleChooserDialog
        isOpen={isDialogOpen}
        styles={styles}
        selectedId={value}
        onSelect={handleSelect}
        onClose={handleClose}
      />
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
