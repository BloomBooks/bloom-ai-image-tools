import JSON5 from "json5";
import type { EthnicityCategory } from "../types";
import ethnicityCatalog from "../data/ethnicities.json5?raw";

const FALLBACK_CATEGORIES: EthnicityCategory[] = [
  {
    id: "asian_general",
    label: "Asian (General)",
    description:
      "Asian visual traits including straighter dark hair, softer facial profiles, and medium to lighter warm skin tones.",
  },
  {
    id: "black_general",
    label: "Black (General)",
    description:
      "Sub-Saharan African traits such as deeper skin tones, tightly coiled hair, and fuller lips.",
  },
  {
    id: "hispanic",
    label: "Hispanic / Latino",
    description:
      "Mixed Indigenous, European, and African ancestry with medium skin tones and dark hair.",
  },
  {
    id: "caucasian",
    label: "Caucasian",
    description:
      "European-origin appearance with lighter skin tones and varied hair and eye colors.",
  },
  {
    id: "middle_eastern",
    label: "Middle Eastern",
    description:
      "Light olive to medium brown skin, dark hair, and strong brow lines.",
  },
  {
    id: "south_asian",
    label: "South Asian",
    description:
      "Medium to dark brown skin, dark wavy hair, and prominent expressive eyes typical across the Indian subcontinent.",
  },
];

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

interface EthnicityCatalogFile {
  categories?: Array<Partial<EthnicityCategory>>;
}

const normalizeCategory = (
  entry: Partial<EthnicityCategory> | undefined
): EthnicityCategory | null => {
  if (!entry) return null;
  const label = isNonEmptyString(entry.label) ? entry.label.trim() : "";
  if (!label.length) {
    return null;
  }
  const idSource = isNonEmptyString(entry.id) ? entry.id : label;
  const description = isNonEmptyString(entry.description)
    ? entry.description.trim()
    : label;
  const normalizedId = idSource.trim();
  return {
    id: normalizedId,
    label,
    description,
  };
};

const parseCatalog = (): EthnicityCategory[] => {
  try {
    const parsed = JSON5.parse(ethnicityCatalog) as EthnicityCatalogFile;
    const categories = Array.isArray(parsed?.categories)
      ? parsed.categories
      : [];
    const normalized = categories
      .map((category) => normalizeCategory(category))
      .filter((category): category is EthnicityCategory => Boolean(category));
    if (normalized.length) {
      return normalized;
    }
  } catch (error) {
    console.error("Failed to parse ethnicity catalog", error);
  }
  return FALLBACK_CATEGORIES;
};

export const ETHNICITY_CATEGORIES: EthnicityCategory[] = parseCatalog();

const normalizeValue = (value?: string | null): string | null => {
  if (!isNonEmptyString(value)) return null;
  return value.trim().toLowerCase();
};

export const getEthnicityById = (
  id?: string | null
): EthnicityCategory | null => {
  const normalized = normalizeValue(id);
  if (!normalized) return null;
  return (
    ETHNICITY_CATEGORIES.find(
      (category) => category.id.trim().toLowerCase() === normalized
    ) ?? null
  );
};

export const getEthnicityByLabel = (
  label?: string | null
): EthnicityCategory | null => {
  const normalized = normalizeValue(label);
  if (!normalized) return null;
  return (
    ETHNICITY_CATEGORIES.find(
      (category) => category.label.trim().toLowerCase() === normalized
    ) ?? null
  );
};

export const getEthnicityByValue = (
  value?: string | null
): EthnicityCategory | null =>
  getEthnicityById(value) ?? getEthnicityByLabel(value);
