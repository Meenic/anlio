import type { Player } from '@/modules/room/types';

export type Question = {
  id: string;
  text: string;
  options: { id: string; text: string }[];
  correctOptionId: string;
  category: string;
};

export interface QuestionPayload {
  index: number;
  total: number;
  question: Omit<Question, 'correctOptionId' | 'category'>;
  phaseEndsAt: number;
}

export interface RevealPayload {
  correctOptionId: string;
  answers: Record<string, string>;
  players: Record<string, Player>;
}
