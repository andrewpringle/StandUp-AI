import { Suspense } from "react";
import { connection } from "next/server";
import { nextQuestion } from "@/server";
import type { NextQuestionResult } from "@/server/contracts";
import Practice from "@/components/Practice";
import OfficialPractice from "@/components/OfficialPractice";
import Skeleton from "@/components/Skeletons";
import { errorText } from "@/components/errors";

// The first question is fetched on the server so the page needs no loading round trip.
async function Quiz() {
  await connection();
  let initial: NextQuestionResult | null = null;
  let err: string | undefined;
  try { initial = await nextQuestion(); } catch (e) { err = errorText(e); }
  return <Practice initial={initial} initialError={err} />;
}

export default function PracticePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Practice</h1>
      <Suspense fallback={<Skeleton rows={5} />}>
        <Quiz />
      </Suspense>
      <OfficialPractice />
    </div>
  );
}
