import { Suspense } from 'react';
import { HomeHero } from '@/components/marketing/home-hero';
import { KickedDialog } from './kicked-dialog';

export default function Home() {
  return (
    <main>
      <Suspense>
        <KickedDialog />
      </Suspense>
      <section className="py-24 sm:py-32">
        <HomeHero />
      </section>
    </main>
  );
}
