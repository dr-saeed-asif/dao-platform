import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  MAX_QUESTIONS,
  applyAnswerSection,
  assemble,
  newSectionState,
  progressLabel,
  validateQuestionBatch,
} from "./answer-sections.ts";

const section = (task_id: string, order: number, text: string, extra = {}) => ({
  task_id, order, title: `Title ${task_id}`, text, revision: 1, ...extra,
});

test("sections render in plan order even when they arrive out of order", () => {
  const state = newSectionState();
  applyAnswerSection(state, section("q3", 2, "third [G1]."));
  const partial = applyAnswerSection(state, section("q1", 0, "first [G2]."));
  assert.equal(partial.answer, "Title q1\nfirst [G2].\n\nTitle q3\nthird [G1].");
  const full = applyAnswerSection(state, section("q2", 1, "second."));
  assert.equal(full.answer.split("\n\n").length, 3);
  assert.ok(full.answer.indexOf("Title q2") < full.answer.indexOf("Title q3"));
});

test("a newer revision replaces a section in place and a stale one is ignored", () => {
  const state = newSectionState();
  applyAnswerSection(state, section("q1", 0, "v2", { revision: 2 }));
  const stale = applyAnswerSection(state, section("q1", 0, "v1", { revision: 1 }));
  assert.match(stale.answer, /v2/);
  assert.doesNotMatch(stale.answer, /v1/);
});

test("citations are collected in answer order with their sources, unknown ids omitted", () => {
  const state = newSectionState();
  const result = applyAnswerSection(
    state,
    section("q1", 0, "A [D2] and B [G1] and C [G9].", {
      cited_sources: [
        { source_id: "G1", content: "x", metadata: {} },
        { source_id: "D2", content: "y", metadata: {} },
      ],
    }),
  );
  assert.deepEqual(result.citations, ["D2", "G1", "G9"]);
  assert.deepEqual(result.cited_sources.map((s) => s.source_id), ["D2", "G1"]);
});

test("100 sections assemble deterministically regardless of completion order", () => {
  const state = newSectionState();
  for (let i = 99; i >= 0; i--) applyAnswerSection(state, section(`q${i + 1}`, i, `t${i}`));
  const answer = assemble(state).answer;
  assert.equal(answer.split("\n\n").length, 100);
  assert.ok(answer.startsWith("Title q1\nt0"));
  assert.ok(answer.endsWith("Title q100\nt99"));
});

test("progress label counts finished checks including failures and skips", () => {
  assert.equal(
    progressLabel({ total: 12, by_status: { completed: 3, failed: 1, skipped: 1, running: 2, pending: 5 } }),
    "Completed 5 of 12 checks",
  );
  assert.equal(progressLabel(undefined), null);
  assert.equal(progressLabel({ total: 0 }), null);
});

test("question batch validation allows 100 and rejects 101, long and oversized batches", () => {
  assert.equal(MAX_QUESTIONS, 100);
  assert.equal(validateQuestionBatch(Array(100).fill("What is the status?")), null);
  assert.match(validateQuestionBatch(Array(101).fill("q?")) ?? "", /up to 100 questions/);
  assert.match(validateQuestionBatch(["x".repeat(4001)]) ?? "", /4,000 characters/);
  assert.match(validateQuestionBatch(Array(11).fill("x".repeat(4000))) ?? "", /40,000 characters/);
});
