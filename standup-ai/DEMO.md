# Student MVP demo

Run `npm ci` and `npm run dev` in `standup-ai`, then open `http://localhost:3000`.
No database or API key is needed for the presentation. The home and student
dashboard routes open `/student-demo/index.html`. The teacher prototype is retained.

The demo opens as Alex Morgan, a fictional student whose beginning test is already
complete. Lesson access is gated on that flag; this build does not implement an
actual diagnostic administration or student authentication.

## Suggested walkthrough

1. View the completed beginning test from the overview.
2. Change the learning approach to see how guidance adapts.
3. Start the linear-equations lesson, use a hint, and answer three released questions.
4. See the lesson summary, activity, and points update.
5. Visit Points & schools; switch regions and redeem an avatar color.
6. Ask StandUp about your current question, then return to the lesson.
7. Submit feedback and reload to confirm it stays in this browser.

Scores, historical study time, school names, and rankings are illustrative.
Real demo activity is tracked separately. Short lessons do not change the sample
SAT score. Points can be earned once per question and lesson. Redeeming points
does not reduce lifetime school contributions. Active lesson time is counted only
while the lesson tab is visible. Preferences, the active lesson, points, feedback,
and chat history are stored locally. Clear site data to reset the presentation.

## Released questions and costs

All four practice questions are preloaded; explanations are authored for the demo.
No test questions are generated, and no API calls run in default presentation mode.

- [College Board SAT Practice Test 9](https://satsuite.collegeboard.org/media/pdf/sat-practice-test-9-digital.pdf): Math module 1, question 2, PDF page 34.
- [College Board SAT Practice Test 10](https://satsuite.collegeboard.org/media/pdf/sat-practice-test-10-digital.pdf): Math module 1, question 10, PDF page 39.
- [ACT 2024–2025, form 2176CPRE](https://www.act.org/content/dam/act/unsecured/documents/Preparing-for-the-ACT-24-25.pdf): math questions 2 and 16, PDF pages 26 and 28. Question 16 uses numeric entry in this demo; its original mathematical content is preserved.

The full tests open at the publisher's site. They are not copied into the project.
The archived ACT uses a legacy format. This MVP does not score the full PDFs.
For commercial school deployment, arrange appropriate content permissions.

## Optional live tutor

The repository configures an Anthropic model through `GEN_MODEL` in
`src/pipeline/generate.ts`. The new `/api/tutor` reuses that exact value; it does not
choose a replacement model or call the question-generation pipeline.

To test locally, set `ANTHROPIC_API_KEY` and `STANDUP_DEMO_LIVE_AI=true` in
`.env.local`, restart the app, then open
`http://localhost:3000/student-demo/index.html?tutor=live#tutor`.
Only this opt-in mode sends a question to the server. Replies are capped at 450
tokens, with a 15-second provider timeout, no automatic retries, and a small
in-memory request limit. An unavailable model falls back visibly to demo guidance.
The configured model must be available to the supplied Anthropic account.
No real provider call was made during development.

This optional endpoint is for a controlled demonstration. The client diagnostic
flag is not authorization. Authentication, persistent quotas, and durable student
storage are outside this demo's scope. The separately hosted static version always
uses demo guidance and has no API endpoint.

## Checks

- `npm run build`
- `npx tsc --noEmit`
- `npx vitest run src/engine/engine.test.ts src/pipeline/pipeline.test.ts src/app/api/tutor/route.test.ts`

The existing retention integration test requires the project's PostgreSQL setup.
Browser checks cover lesson answers (including fractions), hints, completion,
preferences, point rewards, feedback, chat, and a narrow mobile viewport.

The interface uses visible labeled navigation, a clear current section, and one
primary action per lesson. Design reference:
[NN/g Menu-Design Checklist](https://www.nngroup.com/articles/menu-design/).
