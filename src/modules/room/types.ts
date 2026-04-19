import { Question } from '@/modules/game/types';

export type Player = {
  id: string;
  name: string;
  avatarUrl?: string;
  score: number;
  ready: boolean;
  connected: boolean; // tracks if SSE is alive
  answeredAt?: number; // epoch ms — for speed bonus calculation
};

export type RoomPhase =
  | 'lobby' // waiting for players, host configures settings
  | 'starting' // countdown before first question (3-2-1)
  | 'question' // question is live, accepting answers
  | 'reveal' // correct answer shown, scores updated
  | 'leaderboard' // between questions, showing standings
  | 'ended'; // game over

export type RoomSettings = {
  questionCount: number; // 5 | 10 | 15 | 20
  timePerQuestion: number; // seconds: 10 | 20 | 30
  category: string; // "general" | "science" | "history" etc.
  isPublic: boolean;
};

// PUBLIC STATE
export type RoomState = {
  id: string;
  code: string; // 6-digit alphanumeric join code
  hostId: string;
  phase: RoomPhase;
  players: Record<string, Player>;
  settings: RoomSettings;
  currentQuestionIndex: number;
  phaseEndsAt: number | null; // epoch ms — when current phase timer expires
  createdAt: number;
};

// PRIVATE STATE
export type InternalRoomState = RoomState & {
  questions: Question[];
  answers: Record<string, string>;
};
