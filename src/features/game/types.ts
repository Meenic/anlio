import type { Player } from '@/features/room/types';

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

export interface RevealQuestion {
  id: string;
  text: string;
  options: Question['options'];
  category: string;
}

export interface RevealPayload {
  questionIndex: number;
  totalQuestions: number;
  question: RevealQuestion;
  correctOptionId: string;
  answers: Record<string, string>;
  players: Record<string, Player>;
  scoreDeltas: Record<string, number>;
  revealedAt: number;
}

export interface LeaderboardPayload {
  players: Player[];
  nextIn: number;
  questionIndex: number;
  totalQuestions: number;
  topScore: number;
}

export interface GameEndedPayload {
  players: Player[];
  winnerIds: string[];
  topScore: number;
}
