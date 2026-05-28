export interface AspectRatioOption {
  value: string;
  label: string;
  width: number;
  height: number;
}

export interface ImageResolutionLike {
  width: number;
  height: number;
}

export const AUTO_ASPECT_RATIO = "auto";
export const DEFAULT_CREATE_ASPECT_RATIO = "1:1";

export const EXPLICIT_ASPECT_RATIO_OPTIONS: readonly AspectRatioOption[] = [
  { value: "1:8", label: "1:8", width: 1, height: 8 },
  { value: "1:4", label: "1:4", width: 1, height: 4 },
  { value: "2:3", label: "2:3", width: 2, height: 3 },
  { value: "3:4", label: "3:4", width: 3, height: 4 },
  { value: "4:5", label: "4:5", width: 4, height: 5 },
  { value: "9:16", label: "9:16", width: 9, height: 16 },
  { value: "1:1", label: "1:1", width: 1, height: 1 },
  { value: "5:4", label: "5:4", width: 5, height: 4 },
  { value: "4:3", label: "4:3", width: 4, height: 3 },
  { value: "3:2", label: "3:2", width: 3, height: 2 },
  { value: "16:9", label: "16:9", width: 16, height: 9 },
  { value: "21:9", label: "21:9", width: 21, height: 9 },
  { value: "4:1", label: "4:1", width: 4, height: 1 },
  { value: "8:1", label: "8:1", width: 8, height: 1 },
];

export const ALL_EXPLICIT_ASPECT_RATIO_VALUES = EXPLICIT_ASPECT_RATIO_OPTIONS.map(
  (option) => option.value,
);

const ASPECT_RATIO_OPTIONS_BY_VALUE = new Map(
  EXPLICIT_ASPECT_RATIO_OPTIONS.map((option) => [option.value, option]),
);

export const getAspectRatioOption = (
  value: string | null | undefined,
): AspectRatioOption | null => {
  const trimmedValue = value?.trim();
  if (!trimmedValue) {
    return null;
  }

  return ASPECT_RATIO_OPTIONS_BY_VALUE.get(trimmedValue) ?? null;
};

export const getSupportedAspectRatioValues = (
  supportedValues?: readonly string[] | null,
): string[] => {
  const normalized = (supportedValues ?? []).filter(
    (value, index, array): value is string =>
      typeof value === "string" &&
      !!getAspectRatioOption(value) &&
      array.indexOf(value) === index,
  );

  return normalized.length > 0
    ? normalized
    : [...ALL_EXPLICIT_ASPECT_RATIO_VALUES];
};

export const getDefaultAspectRatioValue = (
  supportedValues?: readonly string[] | null,
): string => {
  const resolvedSupportedValues = getSupportedAspectRatioValues(supportedValues);
  return resolvedSupportedValues.includes(DEFAULT_CREATE_ASPECT_RATIO)
    ? DEFAULT_CREATE_ASPECT_RATIO
    : resolvedSupportedValues[0] || DEFAULT_CREATE_ASPECT_RATIO;
};

export const getAspectRatioNumber = (
  value: string | null | undefined,
): number | null => {
  const option = getAspectRatioOption(value);
  if (!option) {
    return null;
  }

  return option.width / option.height;
};

export const getClosestAspectRatioValue = (
  resolution: ImageResolutionLike | null | undefined,
  supportedValues?: readonly string[] | null,
): string => {
  const width = resolution?.width ?? 0;
  const height = resolution?.height ?? 0;
  const candidateValues = getSupportedAspectRatioValues(supportedValues);

  if (!(width > 0) || !(height > 0)) {
    return getDefaultAspectRatioValue(candidateValues);
  }

  const targetRatio = width / height;
  let closest = getDefaultAspectRatioValue(candidateValues);
  let closestDistance = Number.POSITIVE_INFINITY;

  for (const candidateValue of candidateValues) {
    const option = getAspectRatioOption(candidateValue);
    if (!option) {
      continue;
    }
    const optionRatio = option.width / option.height;
    const distance = Math.abs(Math.log(targetRatio / optionRatio));
    if (distance < closestDistance) {
      closest = option.value;
      closestDistance = distance;
    }
  }

  return closest;
};

export const resolveAspectRatioValue = (
  value: string | null | undefined,
  autoResolution?: ImageResolutionLike | null,
  supportedValues?: readonly string[] | null,
): string => {
  const trimmedValue = value?.trim();
  const candidateValues = getSupportedAspectRatioValues(supportedValues);
  if (!trimmedValue) {
    return getDefaultAspectRatioValue(candidateValues);
  }

  if (trimmedValue === AUTO_ASPECT_RATIO) {
    return getClosestAspectRatioValue(autoResolution, candidateValues);
  }

  if (candidateValues.includes(trimmedValue)) {
    return trimmedValue;
  }

  return getDefaultAspectRatioValue(candidateValues);
};

export const getOpenAIOrientation = (
  aspectRatio: string | null | undefined,
): "portrait" | "square" | "landscape" => {
  const ratio = getAspectRatioNumber(aspectRatio);
  if (ratio == null || Math.abs(ratio - 1) < 1e-6) {
    return "square";
  }

  return ratio > 1 ? "landscape" : "portrait";
};

export const getAspectRatioPromptHint = (
  value: string | null | undefined,
  autoResolution?: ImageResolutionLike | null,
  supportedValues?: readonly string[] | null,
): string => {
  const resolvedValue = resolveAspectRatioValue(
    value,
    autoResolution,
    supportedValues,
  );

  switch (resolvedValue) {
    case "1:8":
      return "Use an ultra-tall vertical composition with a 1:8 aspect ratio.";
    case "1:4":
      return "Use a very tall vertical composition with a 1:4 aspect ratio.";
    case "2:3":
      return "Use a portrait composition with a 2:3 aspect ratio.";
    case "3:4":
      return "Use a portrait composition with a 3:4 aspect ratio.";
    case "4:5":
      return "Use a portrait composition with a 4:5 aspect ratio.";
    case "9:16":
      return "Use a tall portrait composition with a 9:16 aspect ratio.";
    case "5:4":
      return "Use a landscape composition with a 5:4 aspect ratio.";
    case "4:3":
      return "Use a landscape composition with a 4:3 aspect ratio.";
    case "3:2":
      return "Use a landscape composition with a 3:2 aspect ratio.";
    case "16:9":
      return "Use a wide landscape composition with a 16:9 aspect ratio.";
    case "21:9":
      return "Use a cinematic wide composition with a 21:9 aspect ratio.";
    case "4:1":
      return "Use an ultra-wide composition with a 4:1 aspect ratio.";
    case "8:1":
      return "Use an extremely wide panoramic composition with an 8:1 aspect ratio.";
    case "1:1":
    default:
      return "Use a square composition with a 1:1 aspect ratio.";
  }
};