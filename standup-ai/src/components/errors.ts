import { AppError, type ErrorCode } from "@/server/contracts";

const MSG: Record<Exclude<ErrorCode, "NOT_FOUND">, string> = {
  SPEND_CAP: "The tutor has reached its spending limit for now. Ask your admin to raise it.",
  NO_KEY: "The tutor isn't set up yet (missing API key).",
  MODEL: "The tutor couldn't answer just now. Please try again.",
  BAD_INPUT: "That didn't look right. Check what you entered and try again.",
};

export const friendly = (e: { code: ErrorCode; message: string }) => (e.code === "NOT_FOUND" ? e.message : MSG[e.code]);

// For server components that call src/server directly and catch whatever it throws.
export const errorText = (e: unknown) =>
  e instanceof AppError ? friendly(e) : "Couldn't load data. Check that the database is running.";
