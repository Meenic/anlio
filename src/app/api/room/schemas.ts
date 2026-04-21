import { z } from 'zod';
import type { RoomSettings } from '@/modules/room/types';

// ---------------------------------------------------------------------------
// Primitive room settings — matches `RoomSettings` in modules/room/types.ts
// ---------------------------------------------------------------------------

export const RoomSettingsSchema = z.object({
  questionCount: z.union([
    z.literal(5),
    z.literal(10),
    z.literal(15),
    z.literal(20),
  ]),
  timePerQuestion: z.union([z.literal(10), z.literal(20), z.literal(30)]),
  category: z.string().min(1).max(32),
  answerMode: z.enum(['allow_changes_until_deadline', 'lock_on_first_submit']),
  isPublic: z.boolean(),
});

/** Defaults used by `create` when the client omits settings. */
export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  questionCount: 10,
  timePerQuestion: 20,
  category: 'general',
  answerMode: 'allow_changes_until_deadline',
  isPublic: false,
};

// ---------------------------------------------------------------------------
// Route body schemas
// ---------------------------------------------------------------------------

export const CreateRoomSchema = z.object({
  settings: RoomSettingsSchema.partial().optional(),
});

export const JoinRoomSchema = z.object({
  // Codes are stored uppercase; coerce input so "abc123" and "ABC123" both work.
  code: z
    .string()
    .length(6)
    .transform((s) => s.toUpperCase()),
});

export const LeaveRoomSchema = z.object({}).strict();

export const ReadySchema = z.object({
  ready: z.boolean(),
});

export const UpdateSettingsSchema = RoomSettingsSchema.partial();

export const StartGameSchema = z.object({}).strict();

export const AnswerSchema = z.object({
  optionId: z.string().min(1).max(64),
});

export const KickSchema = z.object({
  targetId: z.string().min(1),
});
