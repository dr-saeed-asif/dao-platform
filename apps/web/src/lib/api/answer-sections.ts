import type { Source } from "./assistant";

/** Highest number of questions one request may contain. Mirrors the AI server and NestJS limits. */
export const MAX_QUESTIONS = 100;
export const MAX_QUESTION_CHARS = 4000;
export const MAX_TOTAL_CHARS = 40000;

export interface Section {
  order: number;
  title: string;
  text: string;
  revision: number;
}
export interface SectionState {
  sections: Map<string, Section>;
  sources: Map<string, Source>;
}
export interface ProgressiveAnswer {
  answer: string;
  citations: string[];
  cited_sources: Source[];
}

export function newSectionState(): SectionState {
  return { sections: new Map(), sources: new Map() };
}

/**
 * Apply one `answer_section` event. Sections are keyed by task id and rendered in plan order, so a section that
 * finishes early appears in its final position, a later revision replaces it in place, and an older revision
 * that arrives late never overwrites a newer one. Citation ids are run-wide and stable.
 */
export function applyAnswerSection(
  state: SectionState,
  data: Record<string, unknown>,
): ProgressiveAnswer {
  const id = String(data.task_id ?? "");
  const revision = Number(data.revision ?? 1);
  const existing = state.sections.get(id);
  if (id && (!existing || revision >= existing.revision)) {
    state.sections.set(id, {
      order: Number(data.order ?? 0),
      title: String(data.title ?? ""),
      text: String(data.text ?? ""),
      revision,
    });
  }
  if (Array.isArray(data.cited_sources))
    for (const source of data.cited_sources as Source[])
      if (source?.source_id) state.sources.set(source.source_id, source);
  return assemble(state);
}

export function assemble(state: SectionState): ProgressiveAnswer {
  const ordered = [...state.sections.values()].sort((a, b) => a.order - b.order);
  const answer = ordered.map((s) => `${s.title}\n${s.text}`).join("\n\n");
  const citations = [
    ...new Set(Array.from(answer.matchAll(/\[((?:D|G)\d+)\]/g), (m) => m[1])),
  ];
  return {
    answer,
    citations,
    cited_sources: citations
      .map((id) => state.sources.get(id))
      .filter((s): s is Source => !!s),
  };
}

/** "Completed 3 of 12 checks" from a requirement-ledger summary, or null when there is nothing to show. */
export function progressLabel(summary: unknown): string | null {
  const s = summary as { total?: number; by_status?: Record<string, number> } | undefined;
  if (!s?.total) return null;
  const by = s.by_status ?? {};
  const done =
    (by.completed ?? 0) + (by.failed ?? 0) + (by.skipped ?? 0) + (by.cancelled ?? 0);
  return `Completed ${done} of ${s.total} checks`;
}

/** Client-side validation shared by the composer and the plan preview. Returns an error message or null. */
export function validateQuestionBatch(questions: string[]): string | null {
  if (questions.length > MAX_QUESTIONS)
    return `You can submit up to ${MAX_QUESTIONS} questions. Remove a question before adding more.`;
  if (questions.some((q) => q.length > MAX_QUESTION_CHARS))
    return `Each question must be ${MAX_QUESTION_CHARS.toLocaleString("en-US")} characters or fewer.`;
  if (questions.join("").length > MAX_TOTAL_CHARS)
    return `The question batch must be ${MAX_TOTAL_CHARS.toLocaleString("en-US")} characters or fewer.`;
  return null;
}
