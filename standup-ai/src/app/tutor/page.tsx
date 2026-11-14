import { Suspense } from "react";
import { connection } from "next/server";
import { getProgress, getReviewItems } from "@/server";
import type { SkillProgress } from "@/server/contracts";
import ReviewTutor from "@/components/ReviewTutor";
import Skeleton from "@/components/Skeletons";
import { errorText } from "@/components/errors";

async function Picker() {
  await connection();
  let skills: SkillProgress[] | undefined;
  const openCounts: Record<string, number> = {};
  let err = "";
  try {
    skills = (await getProgress()).skills;
    for (const i of await getReviewItems()) if (!i.done) openCounts[i.skillId] = (openCounts[i.skillId] ?? 0) + 1;
  } catch (e) { err = errorText(e); }
  if (!skills) return <p role="alert" className="card bg-error-100 text-error-900 p-4">{err}</p>;
  return <ReviewTutor skills={skills} openCounts={openCounts} />;
}

export default function TutorPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-bold">Tutor</h1>
      <p className="max-w-2xl">Walk back through the questions you got wrong, or saved because you weren&apos;t sure, and the tutor will help you see where your thinking went.</p>
      <Suspense fallback={<Skeleton rows={2} />}>
        <Picker />
      </Suspense>
    </div>
  );
}
