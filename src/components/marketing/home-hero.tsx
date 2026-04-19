'use client';

import { MaxWidthWrapper } from '../layout/max-width-wrapper';
import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
  CardFooter,
} from '../ui/card';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Plus, DoorOpen, Trophy, ChevronRight } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

interface HeroFeature {
  id: string;
  icon: LucideIcon;
  title: ReactNode;
  description: string;
  footer?: ReactNode;
  colors: {
    card: string;
    foreground: string;
    iconBadge: string;
    accent: string;
  };
}

const HERO_FEATURES: HeroFeature[] = [
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
    footer: (
      <Button
        size={'lg'}
        className="h-11 w-full bg-violet-foreground/90 text-violet font-semibold hover:bg-violet-foreground/75"
      >
        Create a Room
        <ChevronRight strokeWidth={3} />
      </Button>
    ),
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
    footer: (
      <form
        className="flex w-full items-center gap-2"
        onSubmit={(e) => e.preventDefault()}
      >
        <Input
          id="room-code-input"
          placeholder="Enter code"
          className="h-11 flex-1 border-lavender-foreground/20 bg-lavender-foreground/10 text-lavender-foreground placeholder:text-lavender-foreground/50 focus-visible:border-lavender-foreground/40 focus-visible:ring-lavender-foreground/15"
        />
        <Button
          type="submit"
          size={'lg'}
          className="h-11 bg-lavender-foreground text-lavender font-semibold hover:bg-lavender-foreground/85"
        >
          Join
        </Button>
      </form>
    ),
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
    footer: (
      <div className="flex items-center gap-2">
        <div className="flex -space-x-2">
          {[1, 2, 3].map((i) => (
            <div
              key={i}
              className="size-7 rounded-full border-2 bg-amber-accent border-amber"
            />
          ))}
        </div>
        <span className="text-xs font-semibold opacity-80">
          +1.2k players active
        </span>
      </div>
    ),
    colors: {
      card: 'bg-amber',
      foreground: 'text-amber-foreground',
      iconBadge: 'bg-amber-foreground/10 text-amber-foreground',
      accent: 'text-amber-accent',
    },
  },
];

export function HomeHero() {
  return (
    <MaxWidthWrapper className="flex flex-col items-center gap-10 text-center sm:gap-14">
      {/* Headline */}
      <div className="flex flex-col items-center gap-6">
        <h1
          id="hero-title"
          className="relative text-balance text-center text-4xl font-semibold sm:text-5xl lg:text-6xl"
        >
          Play <span className="text-violet">trivia</span> with <br /> your
          friends
        </h1>
      </div>

      <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {HERO_FEATURES.map((feature) => {
          const Icon = feature.icon;

          return (
            <Card
              key={feature.id}
              id={`hero-card-${feature.id}`}
              className={`${feature.colors.card} ${feature.colors.foreground} border-none shadow-none ring-0 dark:ring-0 relative overflow-hidden`}
            >
              <CardHeader className="flex-row items-start justify-between">
                <span
                  className={`inline-flex size-12 items-center justify-center rounded-xl ${feature.colors.iconBadge}`}
                >
                  <Icon className="size-6" strokeWidth={1.8} />
                </span>
              </CardHeader>

              {/* Title + description */}
              <CardContent className="flex flex-1 flex-col gap-3 text-left">
                <CardTitle className="text-3xl font-semibold leading-[1.05] sm:text-4xl">
                  {feature.title}
                </CardTitle>

                <CardDescription
                  className={`${feature.colors.foreground} opacity-75 text-sm sm:text-base`}
                >
                  {feature.description}
                </CardDescription>
              </CardContent>

              {feature.footer && <CardFooter>{feature.footer}</CardFooter>}
            </Card>
          );
        })}
      </div>
    </MaxWidthWrapper>
  );
}
