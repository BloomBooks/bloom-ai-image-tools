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

export interface ImagePreviewDialogProps {
  open: boolean;
  images: ImageRecord[];
  onClose: () => void;
}

const getGridTemplateColumns = (imageCount: number) => {
  if (imageCount <= 1) {
    return "minmax(0, 1fr)";
  }

  return "repeat(2, minmax(0, 1fr))";
};

const getGridTemplateRows = (imageCount: number) => {
  if (imageCount <= 2) {
    return "minmax(0, 1fr)";
  }

  return "repeat(2, minmax(0, 1fr))";
};

export const ImagePreviewDialog: React.FC<ImagePreviewDialogProps> = ({
  open,
  images,
  onClose,
}) => {
  const visibleImages = React.useMemo(() => images.slice(-4), [images]);

  return (
    <Dialog
      open={open && visibleImages.length > 0}
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
          {visibleImages.length === 1 ? "Image preview" : `${visibleImages.length} image preview`}
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
        }}
      >
        <Box
          sx={{
            display: "grid",
            gridTemplateColumns: {
              xs: "minmax(0, 1fr)",
              sm: getGridTemplateColumns(visibleImages.length),
            },
            gridTemplateRows: {
              xs: `repeat(${visibleImages.length}, minmax(0, 1fr))`,
              sm: getGridTemplateRows(visibleImages.length),
            },
            gap: { xs: 2, sm: 3 },
            width: "100%",
            height: "100%",
            minHeight: 0,
          }}
        >
          {visibleImages.map((image, index) => {
            const resolution = image.resolution
              ? `${image.resolution.width} x ${image.resolution.height}`
              : null;

            return (
              <Box
                key={image.id}
                data-testid={`image-preview-dialog-item-${index}`}
                sx={{
                  minWidth: 0,
                  minHeight: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 3,
                  backgroundColor: "rgba(15, 23, 42, 0.68)",
                  overflow: "hidden",
                  position: "relative",
                }}
              >
                <Box
                  sx={{
                    width: "100%",
                    height: "100%",
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
                      maxWidth: "100%",
                      maxHeight: "100%",
                      objectFit: "contain",
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
