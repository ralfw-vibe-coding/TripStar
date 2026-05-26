import type { CalendarView } from "../model";
import type { TripStarStateProvider } from "../providers/state-provider";

export async function getCalendar(provider: TripStarStateProvider, now?: Date): Promise<CalendarView> {
  return provider.getCalendarView(now);
}
