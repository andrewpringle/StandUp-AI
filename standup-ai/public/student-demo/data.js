// Short excerpts from official released practice materials. Explanations are
// authored for this demo. Full tests stay at their publisher's official URL.
export const sources = {
  sat9: { name:'SAT Practice Test 9', publisher:'College Board', url:'https://satsuite.collegeboard.org/media/pdf/sat-practice-test-9-digital.pdf', page:34 },
  sat10: { name:'SAT Practice Test 10', publisher:'College Board', url:'https://satsuite.collegeboard.org/media/pdf/sat-practice-test-10-digital.pdf', page:39 },
  act: { name:'ACT 2024–2025 · Form 2176CPRE', publisher:'ACT', url:'https://www.act.org/content/dam/act/unsecured/documents/Preparing-for-the-ACT-24-25.pdf', page:28 },
  act2025: { name:'ACT 2025–2026 · Form 25MC1', publisher:'ACT', url:'https://www.act.org/content/dam/act/unsecured/documents/Preparing-for-the-ACT-e.pdf', page:15 }
};
export const questions = {
  equivalent: {
    id:'sat9-m1-q2', source:'sat9', location:'Math · Module 1 · Question 2',
    prompt:'Which equation has the same solution as the given equation?', equation:'16x + 30 = 190',
    choices:['16x = 30', '16x = 130', '16x = 160', '16x = 190'], answer:2,
    hint:'Keep the two sides balanced. Which operation will undo the +30?',
    steps:['Subtract 30 from both sides of the equation.', '16x + 30 − 30 = 190 − 30', '16x = 160. The solution stays the same.'],
    takeaway:'An equivalent equation keeps the same solution. Whatever you do to one side, do to the other.'
  },
  scale: {
    id:'sat10-m1-q10', source:'sat10', location:'Math · Module 1 · Question 10',
    prompt:'If 4x + 2 = 12, what is the value of 16x + 8?', equation:'4x + 2 = 12',
    choices:['40','48','56','60'], answer:1,
    hint:'Look for a relationship between 4x + 2 and 16x + 8. Do you need to solve for x?',
    steps:['Notice that 16x + 8 = 4(4x + 2).', 'The question tells us that 4x + 2 = 12.', 'Replace the whole expression: 4 × 12 = 48.'],
    takeaway:'Spotting a shared structure can save time. You can scale an entire expression without finding x.'
  },
  distribute: {
    id:'act2176-m-q16', source:'act', location:'Mathematics · Question 16 · Numeric response adapted for demo',
    prompt:'What value of x satisfies the equation?', equation:'−3(4x − 5) = 2(1 − 5x)',
    numeric:true, answer:6.5,
    hint:'Distribute first. Be careful: a negative times a negative is positive.',
    steps:['Distribute: −12x + 15 = 2 − 10x.', 'Add 12x to both sides: 15 = 2 + 2x.', 'Subtract 2, then divide by 2: 13 = 2x, so x = 6.5 (or 13/2).'],
    takeaway:'Distribute to every term inside the parentheses, including its sign.'
  },
  sentenceVerb: {
    id:'act2176-e-q6', source:'act', page:15, location:'English · Question 6 · Sentence excerpt; instructions adapted',
    prompt:'Which replacement makes this a complete sentence?',
    passage:{before:'Today, twenty-nine white lines ',focus:'making',after:' more than half a billion encodings possible.'},
    choices:['NO CHANGE','which make','to make','make'], labels:['F','G','H','J'], answer:3,
    hint:'Find the subject, then check whether it has a main verb that can stand on its own.',
    steps:['The subject is the plural noun phrase about the lines.', 'An -ing form alone does not give this sentence a main verb. The other two longer options also leave it incomplete.', 'Choose J. A simple present-tense verb agrees with the plural subject and completes the thought.'],
    takeaway:'A complete sentence needs a subject and a main verb. An -ing word by itself is not enough.'
  },
  verbAgreement: {
    id:'act25mc1-e-q9', source:'act2025', page:15, location:'English · Question 9 · Short passage excerpt; instructions adapted',
    prompt:'Which verb agrees with the subject?',
    passage:{before:'Partnering with Instituto Atá ',focus:'have enabled',after:' these women …'},
    choices:['No Change','has enabled','are enabling','enable'], answer:1,
    hint:'The subject is the activity of partnering. Does that describe one activity or several people?',
    steps:['The -ing phrase naming the activity is the subject of the sentence.', 'That activity is singular. Nearby plural words do not change the subject.', 'Choose B. Use a singular verb phrase to agree with the activity.'],
    takeaway:'Match the verb to the actual subject. An activity expressed by a gerund phrase takes a singular verb.'
  },
  combine: {
    id:'act2176-m-q2', source:'act', page:26, location:'Mathematics · Question 2',
    prompt:'Which of the following expressions is equivalent to −4x³ − 12x³ + 9x²?', equation:'−4x³ − 12x³ + 9x²',
    choices:['x⁸','−7x⁸','−8x³ + 9x²','−16x³ + 9x²','−16x⁶ + 9x²'], labels:['F','G','H','J','K'], answer:3,
    hint:'Combine terms with the same variable and exponent. Keep the x² term separate.',
    steps:['The like terms are −4x³ and −12x³.', 'Combine their coefficients: −4 − 12 = −16.', 'The result is −16x³ + 9x².'],
    takeaway:'Add coefficients when combining like terms. The exponent stays the same.'
  }
};
export const lessons = [
  { id:'linear', title:'Make equations work for you', topic:'Linear equations', subject:'Math', test:'SAT + ACT', minutes:12, description:'Keep both sides balanced, spot shortcuts, and build confidence with one variable.', questions:['equivalent','scale','distribute'] },
  { id:'english', title:'Give every sentence a strong verb', topic:'Complete sentences & agreement', subject:'English', test:'ACT', minutes:5, description:'Find the subject, choose a main verb, and turn a fragment into a complete thought.', questions:['sentenceVerb','verbAgreement'] },
  { id:'expressions', title:'Bring like terms together', topic:'Equivalent expressions', subject:'Math', test:'ACT', minutes:5, description:'Know what combines, keep track of signs, and simplify with a clear strategy.', questions:['combine'] }
];
export const baselineSkills = [
  {name:'Linear equations',before:42,now:58},
  {name:'Problem solving & data',before:52,now:67},
  {name:'Reading comprehension',before:64,now:76},
  {name:'Grammar & conventions',before:56,now:72}
];
export const localSchools = [
  {name:'Westfield High',short:'WH',points:18240,students:152},
  {name:'Riverside High',short:'RH',points:17680,students:136,you:true},
  {name:'Oakwood Academy',short:'OA',points:16420,students:142},
  {name:'Northview High',short:'NH',points:15360,students:128}
];
