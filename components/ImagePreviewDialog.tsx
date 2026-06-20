import React from "react";
import {
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Typography,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { ImageRecord } from "../types";
import { getHighContrastScrollbarStyles } from "../themes";
import { TRANSPARENCY_BACKGROUND_STYLE } from "./transparencyBackground";

export interface ImagePreviewDialogItem {
  id: string;
  images: ImageRecord[];
}

export interface ImagePreviewDialogProps {
  open: boolean;
  items: ImagePreviewDialogItem[];
  layout?: "row" | "book-pairs";
  onClose: () => void;
}

const previewFrameStyles = {
  borderRadius: 3,
  backgroundColor: "rgba(15, 23, 42, 0.68)",
  overflow: "hidden",
  position: "relative",
} as const;

const PreviewImage: React.FC<{
  image: ImageRecord;
  index: number;
  maxHeight: string;
}> = ({ image, index, maxHeight }) => {
  const resolution = image.resolution
    ? `${image.resolution.width} x ${image.resolution.height}`
    : null;

  return (
    <Box
      sx={{
        ...previewFrameStyles,
        flex: "0 0 auto",
      }}
    >
      <Box
        sx={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          p: { xs: 1.5, sm: 2 },
          minWidth: 0,
          minHeight: 0,
        }}
      >
        <img
          src={image.imageData}
          alt={image.imageFileName || `Preview image ${index + 1}`}
          draggable={false}
          style={{
            display: "block",
            width: "auto",
            height: "auto",
            maxWidth: "min(100%, calc(100vw - 220px))",
            maxHeight,
            objectFit: "contain",
            ...TRANSPARENCY_BACKGROUND_STYLE,
          }}
        />
      </Box>
      {resolution && (
        <Typography
          variant="caption"
          sx={{
            position: "absolute",
            left: 12,
            bottom: 12,
            px: 1,
            py: 0.5,
            borderRadius: 999,
            backgroundColor: "rgba(6, 8, 13, 0.76)",
            color: "#e2e8f0",
          }}
        >
          {resolution}
        </Typography>
      )}
    </Box>
  );
};

export const ImagePreviewDialog: React.FC<ImagePreviewDialogProps> = ({
  open,
  items,
  layout = "row",
  onClose,
}) => {
  const visibleItems = React.useMemo(() => items.filter((item) => item.images.length > 0), [items]);

  return (
    <Dialog
      open={open && visibleItems.length > 0}
      onClose={onClose}
      fullScreen
      PaperProps={{
        "data-testid": "image-preview-dialog",
        sx: {
          backgroundColor: "#06080d",
          color: "#f8fafc",
        },
      }}
    >
      <DialogTitle sx={{ px: { xs: 2, sm: 3 }, py: 2, pr: 8, position: "relative" }}>
        <Typography component="span" variant="h6" sx={{ fontWeight: 600 }}>
          Gallery
        </Typography>
        <IconButton
          aria-label="Close image preview"
          onClick={onClose}
          data-testid="image-preview-dialog-close"
          sx={{
            position: "absolute",
            right: 12,
            top: 12,
            color: "inherit",
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>

      <DialogContent
        sx={{
          px: { xs: 2, sm: 3 },
          py: 0,
          display: "flex",
          minHeight: 0,
          overflowX: "auto",
          overflowY: "auto",
          ...getHighContrastScrollbarStyles(),
        }}
      >
        <Box
          sx={{
            display: "flex",
            gap: { xs: 1.5, sm: 2.5 },
            width: "max-content",
            minWidth: "100%",
            minHeight: 0,
            alignItems: "flex-start",
            pr: { xs: 1, sm: 2 },
          }}
        >
          {visibleItems.map((item, index) => {
            return (
              <Box
                key={item.id}
                data-testid={`image-preview-dialog-item-${index}`}
                sx={{
                  flex: "0 0 auto",
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  gap: layout === "book-pairs" ? 2 : 0,
                  width: layout === "book-pairs" ? "fit-content" : "auto",
                  maxWidth: layout === "book-pairs" ? "calc(100vw - 120px)" : "none",
                }}
              >
                {item.images.map((image, imageIndex) => (
                  <PreviewImage
                    key={image.id}
                    image={image}
                    index={imageIndex}
                    maxHeight={
                      layout === "book-pairs" ? "calc((100vh - 280px) / 2)" : "calc(100vh - 220px)"
                    }
                  />
                ))}
              </Box>
            );
          })}
        </Box>
      </DialogContent>

      <DialogActions sx={{ px: { xs: 2, sm: 3 }, py: 2.5, justifyContent: "center" }}>
        <Button onClick={onClose} variant="contained" color="inherit">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};
