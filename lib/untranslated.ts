/**
 * Localization IDs Bloom has decided not to translate.
 *
 * These stay in English on purpose. Some are messages only a developer or a Bloom staff
 * member preparing artwork will ever read; some name technical details of one generated
 * picture; some are momentary status words. Leaving them out here means two things:
 * `ALL_IMAGE_EDITOR_STRINGS` never asks the host for them, so they cost a translator
 * nothing, and `l10n()` falls back to the English written at the call site.
 *
 * The list is what keeps the two sides in step: every ID `ALL_IMAGE_EDITOR_STRINGS` still
 * asks for has a `<trans-unit>` in Bloom's English XLF files, so Bloom never has to answer
 * for an ID it does not have. Adding a string to the editor therefore means either adding
 * it to Bloom's XLF or adding its ID here.
 *
 * To start translating one of these, take its ID out of this list and add a `<trans-unit>`
 * for it to one of Bloom's English XLF files. The developer picks which file.
 */
export const NOT_TRANSLATED = new Set<string>([
  // Tools and fields for whoever is preparing the artwork, not for the person writing the book.
  "AiImageEditor.Tool.break_comic_into_images.Description",
  "AiImageEditor.Tool.break_comic_into_images.Param.furtherInstructions.Placeholder",
  "AiImageEditor.Panel.OriginalComic",
  "AiImageEditor.Tool.break_into_pieces.Title",
  "AiImageEditor.Tool.break_into_pieces.Description",
  "AiImageEditor.Tool.break_into_pieces.Param.furtherInstructions.Placeholder",

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

  // Everything below is text Bloom has not yet chosen to make localizable, so it has no
  // trans-unit in Bloom's English XLF files. It stays hardcoded here until it does.
  // Connecting a folder on disk to hold history, and what it then reports. The File System
  // Access API this needs exists only in a browser; Bloom stores history itself.
  "AiImageEditor.History.CannotDeleteInOtherStrips",
  "AiImageEditor.History.ConnectFolderForMore",
  "AiImageEditor.History.ConnectHistoryFolder",
  "AiImageEditor.History.DragTip",
  "AiImageEditor.History.MoreHistoryAvailable",
  "AiImageEditor.History.ReconnectFolder",
  "AiImageEditor.History.ReconnectHistoryFolder",
  "AiImageEditor.History.ReconnectNamedHistoryFolder",
  "AiImageEditor.History.RemoveFromHistory",
  "AiImageEditor.Settings.HistoryStorage",
  "AiImageEditor.Settings.HistoryStorageDescription",
  "AiImageEditor.Settings.StopStoringHistoryInFolder",
  "AiImageEditor.Slot.ImageNotLoaded",
  "AiImageEditor.Status.HistoryInBrowserOnly",
  "AiImageEditor.Status.HistorySyncingTo",
  "AiImageEditor.Status.LinkedFolder",
  // How an OpenRouter key reached us.
  "AiImageEditor.OpenRouter.KeyVerifiedWithBalance",
  "AiImageEditor.Status.ApiKeyLinked",
  "AiImageEditor.Status.ConnectedViaOAuth",
  "AiImageEditor.Status.KeyFromEnvironment",
  // Words that flash past: a copy, a save, a preview still loading.
  "AiImageEditor.ArtStyle.LoadingPreview",
  "AiImageEditor.ArtStyle.NoPreview",
  "AiImageEditor.Status.Copied",
  "AiImageEditor.Status.CopyFailed",
  "AiImageEditor.Status.Copying",
  "AiImageEditor.Status.FailedToSave",
  "AiImageEditor.Status.ThumbnailSaved",
  // Hover and drag affordances on the slots.
  "AiImageEditor.ContextMenu.SetThumbnail",
  "AiImageEditor.Result.FollowLatest",
  "AiImageEditor.Slot.CreatingFromScratch",
  "AiImageEditor.Slot.DropToAdd",
  "AiImageEditor.Slot.DropToSetAsSource",
  "AiImageEditor.Slot.PanelDisabled",
  "AiImageEditor.Slot.RemoveReference",
  "AiImageEditor.Slot.StarImage",
  "AiImageEditor.Slot.UnstarImage",
  "AiImageEditor.SlotAction.DisableMagnifier",
  "AiImageEditor.SlotAction.EnableMagnifier",
  // The fragments that name which strips an image sits in.
  "AiImageEditor.Strip.AnotherStrip",
  "AiImageEditor.Strip.ListSeparator",
  "AiImageEditor.Strip.ManyStrips",
  "AiImageEditor.Strip.NamedStrip",
  "AiImageEditor.Strip.TwoStrips",
  // Tool text: descriptions, placeholders, and the options of a few menus.
  "AiImageEditor.Tool.ethnicity.Param.character.Placeholder",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Afro-Caribbean",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Asian (General)",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Australian Aboriginal",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Caucasian",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Central Asian",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.East Asian",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Hispanic / Latino",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Indigenous Central American",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Indigenous North American",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Indigenous South American",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Melanesian",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Micronesian",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Middle Eastern",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Mixed / Multiracial",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.North African",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Polynesian",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.South Asian",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Southeast Asian",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Sub-Saharan African – East African",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Sub-Saharan African – Southern African",
  "AiImageEditor.Tool.ethnicity.Param.ethnicity.Option.Sub-Saharan African – West African",
  "AiImageEditor.Tool.generate_pallet.Description",
  "AiImageEditor.Tool.make_gif.Description",
  "AiImageEditor.Tool.make_gif.Param.animationDescription.Placeholder",
  "AiImageEditor.Tool.make_gif.Param.ending",
  "AiImageEditor.Tool.make_gif.Param.ending.Option.Loops back to the start",
  "AiImageEditor.Tool.make_gif.Param.ending.Option.Plays once (ends on the final state)",
  "AiImageEditor.Tool.make_gif.Param.frameCount",
  "AiImageEditor.Tool.pdf_to_images.Description",
  "AiImageEditor.Tool.remove_object.Description",
  "AiImageEditor.Tool.remove_object.Param.target.Placeholder",
  "AiImageEditor.Tool.stylized_title.Param.style.Option.Gothic",
  "AiImageEditor.Tool.stylized_title.Param.style.Option.Handwritten",
  "AiImageEditor.Tool.stylized_title.Param.style.Option.Neon",
  "AiImageEditor.Tool.stylized_title.Param.style.Option.Playful",
  "AiImageEditor.Tool.stylized_title.Param.style.Option.Storybook",
  "AiImageEditor.Tool.stylized_title.Param.title",
  "AiImageEditor.Tool.stylized_title.Param.title.Placeholder",
]);
