import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export interface HeroFeature {
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
