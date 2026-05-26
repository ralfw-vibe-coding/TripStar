import type { User } from "../model";
import type { RequestOtpResult, TripStarStateProvider, VerifyOtpResult } from "../providers/state-provider";

export async function requestLoginOtp(provider: TripStarStateProvider, email: string): Promise<RequestOtpResult> {
  return provider.requestLoginOtp(email);
}

export async function verifyLoginOtp(
  provider: TripStarStateProvider,
  email: string,
  otp: string,
): Promise<VerifyOtpResult> {
  if (otp.trim().length === 0) {
    throw new Error("OTP is required.");
  }
  return provider.verifyLoginOtp(email, otp);
}

export async function getCurrentUser(provider: TripStarStateProvider, token: string | null): Promise<User | null> {
  if (!token) {
    return null;
  }
  return (await provider.getAuthSession(token))?.user ?? null;
}
