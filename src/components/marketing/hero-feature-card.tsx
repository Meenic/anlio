'use client';

import {
  Card,
  CardHeader,
  CardContent,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import type { HeroFeature } from './hero-features';

interface HeroFeatureCardProps {
  feature: HeroFeature;
}

export function HeroFeatureCard({ feature }: HeroFeatureCardProps) {
  const Icon = feature.icon;

  return (
    <Card
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
}
