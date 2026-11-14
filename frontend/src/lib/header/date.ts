type Suffix = "st" | "nd" | "rd" | "th";

const SUFFIXES: Partial<Record<number, Suffix>> = { 1: "st", 2: "nd", 3: "rd" };

function getOrdinalSuffix(day: number): Suffix {
  if (day % 100 >= 11 && day % 100 <= 13) return "th";
  return SUFFIXES[day % 10] ?? "th";
}

function ukDateWithOrdinal(date: Date = new Date()): string {
  const parts: Intl.DateTimeFormatPart[] = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).formatToParts(date);

  const get = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((p) => p.type === type)?.value ?? "";

  const day: number = Number(get("day"));
  return `${day}${getOrdinalSuffix(day)} ${get("month")} ${get("year")}`;
}

export const ukDate: string = ukDateWithOrdinal();
