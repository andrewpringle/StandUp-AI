"use server";
import * as server from "@/server";
import { AppError, type ErrorCode } from "@/server/contracts";

export type Result<T> = { ok: true; data: T } | { ok: false; error: { code: ErrorCode; message: string } };

// Next redacts thrown messages in production, so failures are returned, never thrown.
async function run<T>(f: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await f() };
  } catch (e) {
    if (e instanceof AppError) return { ok: false, error: { code: e.code, message: e.message } };
    console.error(e);
    return { ok: false, error: { code: "MODEL", message: "Something went wrong." } };
  }
}

// Must be `async function` declarations: "use server" files don't recognize arrow-function exports.
export async function nextQuestionAction(sessionId?: string) {
  return run(() => server.nextQuestion(sessionId));
}
export async function submitAnswerAction(i: Parameters<typeof server.submitAnswer>[0]) {
  return run(() => server.submitAnswer(i));
}
export async function getReviewItemsAction(skillId?: string) {
  return run(() => server.getReviewItems(skillId));
}
export async function toggleFlagAction(i: Parameters<typeof server.toggleFlag>[0]) {
  return run(() => server.toggleFlag(i));
}
export async function reviewWorkAction(i: Parameters<typeof server.reviewWork>[0]) {
  return run(() => server.reviewWork(i));
}
export async function tutorMessageAction(i: Parameters<typeof server.tutorMessage>[0]) {
  return run(() => server.tutorMessage(i));
}
export async function finishTutorAction(i: Parameters<typeof server.finishTutor>[0]) {
  return run(() => server.finishTutor(i));
}
