import React from "react";

/**
 * An image component that shows a magnifying glass lens on hover.
 * The lens follows the cursor and shows a zoomed view of that area.
 */
export type MagnifiableImageProps =
  React.ImgHTMLAttributes<HTMLImageElement> & {
    zoom?: number;
    lensSize?: number;
    lensBorderColor?: string;
    enableLens?: boolean;
  };

type LensStyleState = {
  left: number;
  top: number;
  backgroundPosition: string;
  backgroundSize: string;
};

const isPointerInteraction = (pointerType: string) =>
  pointerType === "mouse" || pointerType === "pen";

export const MagnifiableImage = React.forwardRef<
  HTMLImageElement,
  MagnifiableImageProps
>((props, forwardedRef) => {
  const {
    zoom = 2.25,
    lensSize = 160,
    lensBorderColor = "rgba(255,255,255,0.55)",
    src,
    enableLens = false,
    className: _unusedClassName,
    ...restImgProps
  } = props;

  // Ignore incoming className to keep styling controlled within this component.
  void _unusedClassName;

  const imageRef = React.useRef<HTMLImageElement | null>(null);
  const wrapperRef = React.useRef<HTMLDivElement | null>(null);

  const mergedRefs = React.useCallback(
    (node: HTMLImageElement | null) => {
      imageRef.current = node;

      if (typeof forwardedRef === "function") {
        forwardedRef(node);
        return;
      }

      if (forwardedRef) {
        forwardedRef.current = node;
      }
    },
    [forwardedRef]
  );

  const [lensVisible, setLensVisible] = React.useState(false);
  const [lensStyles, setLensStyles] = React.useState<LensStyleState>({
    left: 0,
    top: 0,
    backgroundPosition: "0px 0px",
    backgroundSize: "0px 0px",
  });

  React.useEffect(() => {
    setLensVisible(false);
  }, [src]);

  React.useEffect(() => {
    if (!enableLens) {
      setLensVisible(false);
    }
  }, [enableLens]);

  const updateLensPosition = React.useCallback(
    (clientX: number, clientY: number) => {
      if (!imageRef.current || !wrapperRef.current || !src) return;

      const imageRect = imageRef.current.getBoundingClientRect();
      const wrapperRect = wrapperRef.current.getBoundingClientRect();
      if (!imageRect.width || !imageRect.height) return;

      const offsetX = clientX - imageRect.left;
      const offsetY = clientY - imageRect.top;

      if (
        offsetX < 0 ||
        offsetY < 0 ||
        offsetX > imageRect.width ||
        offsetY > imageRect.height
      ) {
        setLensVisible(false);
        return;
      }

      const clampedX = Math.max(0, Math.min(offsetX, imageRect.width));
      const clampedY = Math.max(0, Math.min(offsetY, imageRect.height));
      const halfLens = lensSize / 2;

      const lensX = Math.max(
        0,
        Math.min(
          clientX - wrapperRect.left - halfLens,
          Math.max(wrapperRect.width - lensSize, 0)
        )
      );
      const lensY = Math.max(
        0,
        Math.min(
          clientY - wrapperRect.top - halfLens,
          Math.max(wrapperRect.height - lensSize, 0)
        )
      );

      setLensStyles({
        left: lensX,
        top: lensY,
        backgroundPosition: `${-(clampedX * zoom - halfLens)}px ${-(
          clampedY * zoom -
          halfLens
        )}px`,
        backgroundSize: `${imageRect.width * zoom}px ${
          imageRect.height * zoom
        }px`,
      });

      setLensVisible(true);
    },
    [lensSize, src, zoom]
  );

  const handlePointerEnter = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!src || !enableLens || !isPointerInteraction(event.pointerType)) return;
    updateLensPosition(event.clientX, event.clientY);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!src || !enableLens || !isPointerInteraction(event.pointerType)) return;
    updateLensPosition(event.clientX, event.clientY);
  };

  const handlePointerLeave = () => {
    setLensVisible(false);
  };

  const baseWrapperStyle: React.CSSProperties = {
    position: "relative",
    display: "flex",
    height: "100%",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
  };

  const baseImageStyle: React.CSSProperties = {
    display: "block",
    userSelect: "none",
  };

  return (
    <div
      ref={wrapperRef}
      style={baseWrapperStyle}
      onPointerEnter={handlePointerEnter}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      onPointerCancel={handlePointerLeave}
    >
      <img
        {...restImgProps}
        ref={mergedRefs}
        src={src}
        style={{
          ...baseImageStyle,
          ...(restImgProps.style ?? {}),
        }}
      />

      {lensVisible && enableLens && src && (
        <div
          aria-hidden="true"
          style={{
            pointerEvents: "none",
            position: "absolute",
            borderRadius: "50%",
            width: lensSize,
            height: lensSize,
            left: lensStyles.left,
            top: lensStyles.top,
            zIndex: 50,
            border: `2px solid ${lensBorderColor}`,
            backgroundImage: `url(${src})`,
            backgroundRepeat: "no-repeat",
            backgroundPosition: lensStyles.backgroundPosition,
            backgroundSize: lensStyles.backgroundSize,
            boxShadow: "0 12px 30px rgba(15, 23, 42, 0.35)",
            transition: "opacity 150ms ease",
          }}
        />
      )}
    </div>
  );
});

MagnifiableImage.displayName = "MagnifiableImage";
