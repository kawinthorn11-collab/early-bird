# Course content schema

One file per course: `content/courses/<CODE>.json` (e.g. `GE011.json`).

```jsonc
{
  "code": "GE011",
  "basis_th": "เตรียมตัวจากคำอธิบายรายวิชาในหลักสูตร V.67.3 เนื้อหาจริงในห้องขึ้นกับอาจารย์ผู้สอน",
  "in_class_th": ["สิ่งที่น่าจะเจอในห้อง 3-5 ข้อ เป็นการคาดการณ์จากคำอธิบายรายวิชา เขียนให้ชัดว่าเป็นการคาด"],
  "units": [
    {
      "id": "GE011-U1",                 // <CODE>-U<n>, n from 1
      "title_th": "...", "title_en": "...",
      "covers": "วลีจากคำอธิบายรายวิชาที่หน่วยนี้ครอบคลุม (คัดลอกตรง)",
      "minutes": 10,                    // estimated self-study time
      "lessons": ["L01"],               // OPTIONAL: ids of existing grammar lessons (content/lessons/Lxx.json) this unit reuses
      "interview": ["I01"],             // OPTIONAL: ids from content/interview.json this unit reuses
      "cards": [                        // 3-5 short explainer cards, Thai, warm, plain; one idea each
        { "title_th": "...", "body_th": "...", "example": "optional English or Thai example" }
      ],
      "vocab": [["critical thinking", "การคิดเชิงวิพากษ์"]],   // 5-10 pairs, English term first
      "questions": [ /* MCQ, >= 8 per unit unless the unit reuses lessons (then >= 4 new ones) */
        {
          "id": "GE011-U1-01", "skill": "GE011-U1", "difficulty": 1,
          "stem": "...", "options": ["a","b","c","d"], "answer": 0,
          "explanation_th": "...", "why_wrong": [null, "...", "...", "..."]
        }
      ],
      "say": ["One short English sentence to say aloud about this unit."],  // 2-3, A2-B1
      "task_th": "งานเล็ก 1 อย่างที่ทำได้จริงใน 10 นาที"
    }
  ]
}
```

Rules:
- Exactly one defensible answer per question. `why_wrong` aligned with options, `null` at the answer, a specific Thai reason for each distractor.
- Spread answers evenly over positions 0-3 within each course.
- The correct option may be the longest (or tied longest) in at most half of a course's questions; make distractors as long and plausible as the answer.
- Questions must stand alone (Quick Run shows them without the cards): a question about a passage carries it in the stem as `Passage: "..."`.
- Thai for explanation; English for terms, `say`, and (for English-language courses) stems. GE courses may use Thai stems with English key terms in brackets, because the student is an English major and should learn the English terms.
- Original writing only. No copying from textbooks or websites. Facts must be well-established and non-controversial; if unsure, leave it out.
- No em-dash characters. No invented facts about the student or about BU beyond the curriculum text.
