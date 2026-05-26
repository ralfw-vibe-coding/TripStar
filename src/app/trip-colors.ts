import type { Trip } from "../domain/model";

const tripColors = [
  "#0f766e",
  "#be123c",
  "#a16207",
  "#1d4ed8",
  "#15803d",
  "#7c3aed",
  "#c2410c",
  "#0e7490",
  "#be185d",
  "#4d7c0f",
  "#4338ca",
  "#b91c1c",
  "#166534",
  "#a21caf",
  "#b45309",
  "#075985",
  "#6d28d9",
  "#047857",
  "#854d0e",
  "#0369a1",
];

export function tripColor(trip: Pick<Trip, "tripNumber" | "color">): string {
  if (trip.color) {
    return trip.color;
  }

  const parsed = Number.parseInt(trip.tripNumber, 10);
  const index = Number.isFinite(parsed) ? (parsed - 1) % tripColors.length : 0;
  return tripColors[index];
}
