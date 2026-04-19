'use client';

import { MaxWidthWrapper } from '@/components/layout/max-width-wrapper';
import { HeroFeatureCard } from './hero-feature-card';
import { HERO_FEATURES } from './hero-data';

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

      {/* Feature Cards */}
      <div className="grid w-full grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {HERO_FEATURES.map((feature) => (
          <HeroFeatureCard key={feature.id} feature={feature} />
        ))}
      </div>
    </MaxWidthWrapper>
  );
}
