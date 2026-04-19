import type { Question } from './types';
import type { RoomSettings } from '@/modules/room/types';

/**
 * Fetch questions for a game session.
 *
 * TODO: Replace this stub with a real DB / API call.
 * The function signature is stable — only the implementation needs to change.
 */
export async function fetchQuestions(
  settings: RoomSettings
): Promise<Question[]> {
  const { questionCount, category } = settings;

  // Placeholder: generate deterministic dummy questions
  return Array.from(
    { length: questionCount },
    (_, i): Question => ({
      id: `q-${category}-${i + 1}`,
      text: `Sample question ${i + 1} (${category})`,
      options: [
        { id: 'a', text: 'Option A' },
        { id: 'b', text: 'Option B' },
        { id: 'c', text: 'Option C' },
        { id: 'd', text: 'Option D' },
      ],
      correctOptionId: 'a',
      category,
    })
  );
}
