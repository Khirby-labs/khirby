import { AppException } from '../../core/errors/app-exception';

/** Public adaptive plan/submit — reject junk before any LLM call. */
export const ADAPTIVE_OPENING_MIN_CHARS = 20;
export const ADAPTIVE_OPENING_MAX_CHARS = 4_000;
export const ADAPTIVE_MAX_FOLLOW_UPS = 5;
export const ADAPTIVE_QUESTION_MAX_CHARS = 500;
export const ADAPTIVE_ANSWER_MAX_CHARS = 2_000;

export function assertPublicAdaptiveOpening(opening: string): void {
  const text = opening.trim();
  if (!text) {
    throw AppException.badRequest('opening (or content) is required.');
  }
  if (text.length < ADAPTIVE_OPENING_MIN_CHARS) {
    throw AppException.badRequest(
      `Opening must be at least ${ADAPTIVE_OPENING_MIN_CHARS} characters.`,
      { field: 'opening' },
    );
  }
  if (text.length > ADAPTIVE_OPENING_MAX_CHARS) {
    throw AppException.badRequest(
      `Opening must be at most ${ADAPTIVE_OPENING_MAX_CHARS} characters.`,
      { field: 'opening' },
    );
  }
}

export function assertPublicAdaptiveBatch(input: {
  opening: string;
  questions: string[];
  answers: string[];
}): { opening: string; questions: string[]; answers: string[] } {
  assertPublicAdaptiveOpening(input.opening);
  const opening = input.opening.trim();
  const questions = input.questions.map((q) => String(q ?? '').trim()).filter(Boolean);
  const answers = input.answers.map((a) => String(a ?? '').trim());

  if (!questions.length) {
    throw AppException.badRequest('questions[] is required.');
  }
  if (questions.length > ADAPTIVE_MAX_FOLLOW_UPS) {
    throw AppException.badRequest(
      `At most ${ADAPTIVE_MAX_FOLLOW_UPS} follow-up questions are allowed.`,
      { field: 'questions' },
    );
  }
  if (answers.length !== questions.length) {
    throw AppException.badRequest(
      `Expected ${questions.length} answers (one per question), got ${answers.length}.`,
    );
  }
  if (answers.some((a) => !a)) {
    throw AppException.badRequest('Every planned question needs a non-empty answer.');
  }
  for (let i = 0; i < questions.length; i++) {
    if (questions[i].length > ADAPTIVE_QUESTION_MAX_CHARS) {
      throw AppException.badRequest(
        `Question ${i + 1} must be at most ${ADAPTIVE_QUESTION_MAX_CHARS} characters.`,
        { field: 'questions' },
      );
    }
    if (answers[i].length > ADAPTIVE_ANSWER_MAX_CHARS) {
      throw AppException.badRequest(
        `Answer ${i + 1} must be at most ${ADAPTIVE_ANSWER_MAX_CHARS} characters.`,
        { field: 'answers' },
      );
    }
  }

  return { opening, questions, answers };
}
