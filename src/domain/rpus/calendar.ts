import type { CalendarView } from "../model";
import type { TripStarStateProvider } from "../providers/state-provider";

export async function getCalendar(provider: TripStarStateProvider, userId: string, now?: Date): Promise<CalendarView> {
  return provider.getCalendarView(userId, now);
}
