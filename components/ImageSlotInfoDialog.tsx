import React from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import { ImageRecord } from "../types";
import { ImageInfoPanel } from "./ImageInfoPanel";

export interface ImageSlotInfoDialogProps {
  open: boolean;
  image: ImageRecord | null;
  label?: string;
  onClose: () => void;
}

export const ImageSlotInfoDialog: React.FC<ImageSlotInfoDialogProps> = ({
  open,
  image,
  label,
  onClose,
}) => {
  if (!image) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      maxWidth="sm"
      fullWidth
      PaperProps={{
        "data-testid": "image-info-dialog",
        sx: {
          borderRadius: 3,
        },
      }}
    >
      <DialogTitle sx={{ pr: 6 }}>
        {label ? `${label} info` : "Image info"}
        <IconButton
          aria-label="Close"
          onClick={onClose}
          data-testid="image-info-dialog-close"
          sx={{
            position: "absolute",
            right: 8,
            top: 8,
          }}
        >
          <CloseIcon />
        </IconButton>
      </DialogTitle>
      <DialogContent dividers>
        <ImageInfoPanel item={image} />
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};
