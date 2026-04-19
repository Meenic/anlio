import { Plus, DoorOpen, Trophy } from 'lucide-react';
import type { HeroFeature } from './hero-features';
import {
  CreateRoomButton,
  JoinRoomForm,
  LeaderboardStats,
} from './hero-footers';

export const HERO_FEATURES: HeroFeature[] = [
  {
    id: 'create-room',
    icon: Plus,
    title: (
      <>
        Create <br />
        <em className="not-italic font-extrabold">Room</em>
      </>
    ),
    description:
      'Start a new trivia room and invite your friends to play together.',
    footer: <CreateRoomButton />,
    colors: {
      card: 'bg-violet',
      foreground: 'text-violet-foreground',
      iconBadge: 'bg-white/15 text-violet-foreground',
      accent: 'text-violet-accent',
    },
  },
  {
    id: 'join-room',
    icon: DoorOpen,
    title: (
      <>
        Join <br />
        <em className="not-italic font-extrabold">Room</em>
      </>
    ),
    description: 'Got a room code? Jump right in and play with others.',
    footer: <JoinRoomForm />,
    colors: {
      card: 'bg-lavender',
      foreground: 'text-lavender-foreground',
      iconBadge: 'bg-lavender-foreground/10 text-lavender-foreground',
      accent: 'text-lavender-accent',
    },
  },
  {
    id: 'leaderboard',
    icon: Trophy,
    title: (
      <>
        Global <br />
        <em className="not-italic font-extrabold underline decoration-amber-accent decoration-[3px] underline-offset-4">
          Rankings
        </em>
      </>
    ),
    description: "See who's on top. Track scores and compete for the #1 spot.",
    footer: <LeaderboardStats />,
    colors: {
      card: 'bg-amber',
      foreground: 'text-amber-foreground',
      iconBadge: 'bg-amber-foreground/10 text-amber-foreground',
      accent: 'text-amber-accent',
    },
  },
];
