/**
 * Localization IDs Bloom has decided not to translate.
 *
 * These stay in English on purpose. Some are messages only a developer or a Bloom staff
 * member preparing artwork will ever read; some name technical details of one generated
 * picture; some are momentary status words. Leaving them out here means two things:
 * `ALL_IMAGE_EDITOR_STRINGS` never asks the host for them, so they cost a translator
 * nothing, and `l10n()` falls back to the English written at the call site.
 *
 * To start translating one of these, take its ID out of this list and add a `<trans-unit>`
 * for it to one of Bloom's English XLF files. The developer picks which file.
 */
export const NOT_TRANSLATED = new Set<string>([
  // Tools and fields for whoever is preparing the artwork, not for the person writing the book.
  "AiImageEditor.Tool.break_comic_into_images.Description",
  "AiImageEditor.Tool.break_comic_into_images.Param.furtherInstructions.Placeholder",
  "AiImageEditor.Tool.break_into_pieces.Title",
  "AiImageEditor.Tool.break_into_pieces.Description",
  "AiImageEditor.Tool.break_into_pieces.ActionButton",
  "AiImageEditor.Tool.break_into_pieces.Param.furtherInstructions.Placeholder",
  "AiImageEditor.Tool.coloring_book.Description",

  // The panel of technical details about one generated picture.
  "AiImageEditor.Info.ArtStyle",
  "AiImageEditor.Info.AssociatedText",
  "AiImageEditor.Info.Cost",
  "AiImageEditor.Info.Duration",
  "AiImageEditor.Info.Format",
  "AiImageEditor.Info.FullPrompt",
  "AiImageEditor.Info.Import",
  "AiImageEditor.Info.Model",
  "AiImageEditor.Info.Parameters",
  "AiImageEditor.Info.PromptUnavailable",
  "AiImageEditor.Info.Reasoning",
  "AiImageEditor.Info.ShowLess",
  "AiImageEditor.Info.ShowMore",
  "AiImageEditor.Info.Sources",
  "AiImageEditor.Info.Tool",
  "AiImageEditor.InfoDialog.CopyPrompt",
  "AiImageEditor.InfoDialog.Title",
  "AiImageEditor.InfoDialog.TitleForSlot",
  "AiImageEditor.Model.NoModel",

  // Warnings about how a replacement picture compares with the one it replaces.
  "AiImageEditor.Replacement.AspectRatioChanged",
  "AiImageEditor.Replacement.ResolutionDecreased",
  "AiImageEditor.Replacement.ResolutionIncreased",
  "AiImageEditor.Shape.WillReframe",

  // Step names and moments that flash past while a tool runs.
  "AiImageEditor.Phase.GeneratingSheet",
  "AiImageEditor.Phase.RemovingBackground",
  "AiImageEditor.Phase.SplittingIntoImages",
  "AiImageEditor.Phase.TranscribingCaptions",
  "AiImageEditor.Drag.Dragging",
  "AiImageEditor.Batch.CannotAdd",
  "AiImageEditor.Batch.FailedBadge",

  // The money meter's states other than the amounts themselves.
  "AiImageEditor.Credits.ConnectToView",
  "AiImageEditor.Credits.StatusUnavailable",
  "AiImageEditor.Credits.Updating",
  "AiImageEditor.Credits.UsedNoLimit",
  "AiImageEditor.Credits.UsedOfLimit",

  // Failures to do with files, folders and the browser, which a translator cannot act on.
  "AiImageEditor.Error.CouldNotDisableFolder",
  "AiImageEditor.Error.CouldNotEnableFolder",
  "AiImageEditor.Error.CouldNotLoadReferenceImage",
  "AiImageEditor.Error.CouldNotReadPdf",
  "AiImageEditor.Error.CouldNotReconnectFolder",
  "AiImageEditor.Error.CouldNotSaveImageToFolder",
  "AiImageEditor.Error.CouldNotSaveMetadata",
  "AiImageEditor.Error.PdfHasNoPages",
  "AiImageEditor.Preview.CouldNotLoad",
  "AiImageEditor.Preview.NotInStorage",
  "AiImageEditor.Settings.ChromiumNeeded",
  "AiImageEditor.Settings.ChromiumNeededDetails",
  "AiImageEditor.Settings.ImagesAreWrittenTo",
  "AiImageEditor.Settings.YourFolder",

  // What the editor says while it is handing pictures back to Bloom.
  "AiImageEditor.Host.Cancelled",
  "AiImageEditor.Host.CommitFailed",
  "AiImageEditor.Host.Committed",
  "AiImageEditor.Host.CommittedOne",
  "AiImageEditor.Host.Committing",
  "AiImageEditor.Host.NoReplacementsAssigned",
  "AiImageEditor.Host.WaitingForInit",
]);
