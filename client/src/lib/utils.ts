import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function formatTime(seconds: number): string {
  const s = Math.floor(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, "0")}`;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
