import { format, formatDistanceToNowStrict } from "date-fns";

const TZ = "Europe/Amsterdam";

/** Absolute time in the organization's time zone. */
export function abs(iso: string, withTime = true) {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    day: "2-digit",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(d);
}
export function rel(iso: string) {
  const d = new Date(iso);
  const s = formatDistanceToNowStrict(d, { addSuffix: true });
  return s;
}
export function both(iso: string) {
  return `${abs(iso)} (${rel(iso)})`;
}
export function countdown(iso: string) {
  const ms = new Date(iso).getTime() - Date.now();
  const neg = ms < 0;
  const m = Math.abs(ms) / 6e4;
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const mm = Math.floor(m % 60);
  const txt = d ? `${d}d ${h}h` : h ? `${h}h ${mm}m` : `${mm}m`;
  return { text: neg ? `${txt} overdue` : `${txt} left`, overdue: neg, hours: ms / 36e5 };
}
export const day = (iso: string) => format(new Date(iso), "dd MMM");
