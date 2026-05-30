import React from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Tooltip,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { ImageRecord } from "../types";
import { ImageInfoPanel } from "./ImageInfoPanel";
import { copyTextToClipboard } from "../lib/textClipboard";

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
  const [promptCopied, setPromptCopied] = React.useState(false);
  const copyResetTimeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
    };
  }, []);

  React.useEffect(() => {
    if (!open || image) {
      return;
    }
    setPromptCopied(false);
  }, [open, image]);

  const promptContent =
    image?.promptUsed && image.promptUsed.length ? image.promptUsed : "Prompt unavailable.";

  const handleCopyPrompt = async () => {
    if (!image) {
      return;
    }
    const ok = await copyTextToClipboard(promptContent);
    if (!ok) return;

    setPromptCopied(true);
    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
    }
    copyResetTimeoutRef.current = window.setTimeout(() => {
      setPromptCopied(false);
      copyResetTimeoutRef.current = null;
    }, 1500);
  };

  return (
    <Dialog
      open={open && !!image}
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
      <DialogTitle sx={{ pr: 12 }}>
        {label ? `${label} info` : "Image info"}
        <Tooltip title={promptCopied ? "Copied" : "Copy prompt"}>
          <IconButton
            aria-label="Copy full prompt"
            onClick={handleCopyPrompt}
            size="small"
            data-testid="image-info-dialog-copy-prompt"
            sx={{ position: "absolute", right: 44, top: 8 }}
          >
            <ContentCopyIcon fontSize="inherit" />
          </IconButton>
        </Tooltip>
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
      <DialogContent dividers>{image ? <ImageInfoPanel item={image} /> : null}</DialogContent>
      <DialogActions>
        <Button onClick={onClose} variant="contained">
          Close
        </Button>
      </DialogActions>
    </Dialog>
  );
};
