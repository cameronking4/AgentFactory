import type { DateRangePreset } from "../types";

export const getDateRangeFromPreset = (preset: DateRangePreset | null): { start: Date | null; end: Date | null } => {
  if (!preset) return { start: null, end: null };

  const now = new Date();
  let start: Date;

  switch (preset) {
    case "1h":
      start = new Date(now.getTime() - 60 * 60 * 1000);
      break;
    case "3h":
      start = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      break;
    case "6h":
      start = new Date(now.getTime() - 6 * 60 * 60 * 1000);
      break;
    case "12h":
      start = new Date(now.getTime() - 12 * 60 * 60 * 1000);
      break;
    case "24h":
      start = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      break;
    case "3d":
      start = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      break;
    case "1w":
      start = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      break;
    case "2w":
      start = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
      break;
    case "month":
      start = new Date(now.getFullYear(), now.getMonth(), 1);
      break;
    case "quarter":
      const quarter = Math.floor(now.getMonth() / 3);
      start = new Date(now.getFullYear(), quarter * 3, 1);
      break;
    case "year":
      start = new Date(now.getFullYear(), 0, 1);
      break;
    default:
      return { start: null, end: null };
  }

  return { start, end: now };
};

export const dateRangePresetLabels: Record<DateRangePreset, string> = {
  "1h": "Last 1 hour",
  "3h": "Last 3 hours",
  "6h": "Last 6 hours",
  "12h": "Last 12 hours",
  "24h": "Last 24 hours",
  "3d": "Last 3 days",
  "1w": "Last week",
  "2w": "Last two weeks",
  "month": "This month",
  "quarter": "This quarter",
  "year": "This year",
};

