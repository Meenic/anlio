import { performance } from 'node:perf_hooks';

const BASE_URL = 'http://localhost:3000';

// We'll store our session cookie here to authenticate subsequent requests
let sessionCookie = '';

// Helper to track request performance
async function trackedFetch(
  name: string,
  endpoint: string,
  options: RequestInit = {}
) {
  const start = performance.now();

  const headers = new Headers(options.headers || {});
  if (sessionCookie) {
    headers.set('Cookie', sessionCookie);
  }
  if (
    !headers.has('Content-Type') &&
    options.method &&
    options.method !== 'GET'
  ) {
    headers.set('Content-Type', 'application/json');
  }

  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  const duration = performance.now() - start;
  const redisCalls = response.headers.get('x-metrics-redis') || '0';
  const dbCalls = response.headers.get('x-metrics-db') || '0';

  // Extract set-cookie to keep session alive
  const setCookie = response.headers.get('set-cookie');
  if (setCookie) {
    // Basic extraction of the session cookie for this simple script
    const betterAuthCookie = setCookie
      .split(',')
      .find((c) => c.includes('better-auth.session_token'));
    if (betterAuthCookie) {
      sessionCookie = betterAuthCookie.split(';')[0];
    }
  }

  let data;
  try {
    data = await response.json();
  } catch {
    data = null;
  }

  console.log(
    `[${response.status}] ${name.padEnd(20)} | ${duration.toFixed(2).padStart(8)}ms | R:${redisCalls.padStart(2)} D:${dbCalls.padStart(2)} | ${options.method || 'GET'} ${endpoint}`
  );

  if (!response.ok) {
    console.error(`  -> Failed:`, data);
  }

  return { response, data, duration };
}

async function runBenchmark() {
  console.log('================================================');
  console.log('🚀 ANLIO API PERFORMANCE & FLOW TRACER');
  console.log('================================================\n');

  const stats: Record<string, number> = {};

  try {
    // 1. Authenticate (Anonymous Login via Better Auth)
    const { duration: t1 } = await trackedFetch(
      'Anonymous Login',
      '/api/auth/sign-in/anonymous',
      {
        method: 'POST',
        body: JSON.stringify({}),
      }
    );
    stats['Login'] = t1;

    // 2. Create Room
    const { data: roomData, duration: t2 } = await trackedFetch(
      'Create Room',
      '/api/room',
      {
        method: 'POST',
        body: JSON.stringify({
          settings: {
            questionCount: 5,
            timePerQuestion: 20,
            category: 'general',
            isPublic: false,
            answerMode: 'lock_on_first_submit',
          },
        }),
      }
    );
    stats['Create Room'] = t2;

    if (!roomData || !roomData.id) {
      throw new Error('Failed to create room. Exiting.');
    }

    const roomId = roomData.id;
    const roomCode = roomData.code;
    console.log(`\n  ✅ Created Room! ID: ${roomId} | Code: ${roomCode}\n`);

    // 3. Join Room (to simulate the redirect flow after creation)
    const { duration: t3 } = await trackedFetch('Join Room', '/api/room/join', {
      method: 'POST',
      body: JSON.stringify({ code: roomCode }),
    });
    stats['Join Room'] = t3;

    // 4. Update Settings
    const { duration: t4 } = await trackedFetch(
      'Update Settings',
      `/api/room/${roomId}/settings`,
      {
        method: 'POST',
        body: JSON.stringify({
          settings: { questionCount: 10 }, // Changing question count
        }),
      }
    );
    stats['Update Settings'] = t4;

    // 5. Toggle Ready
    const { duration: t5 } = await trackedFetch(
      'Toggle Ready',
      `/api/room/${roomId}/ready`,
      {
        method: 'POST',
        body: JSON.stringify({ ready: true }),
      }
    );
    stats['Ready Up'] = t5;

    // 6. Leave Room
    const { duration: t6 } = await trackedFetch(
      'Leave Room',
      `/api/room/${roomId}/leave`,
      {
        method: 'POST',
        body: JSON.stringify({}),
      }
    );
    stats['Leave Room'] = t6;

    console.log('\n================================================');
    console.log('📊 PERFORMANCE SUMMARY');
    console.log('================================================');

    let totalTime = 0;
    for (const [name, time] of Object.entries(stats)) {
      console.log(`${name.padEnd(25)} : ${time.toFixed(2)} ms`);
      totalTime += time;
    }
    console.log('------------------------------------------------');
    console.log(`TOTAL API TIME            : ${totalTime.toFixed(2)} ms`);
    console.log(`TOTAL REQUESTS            : ${Object.keys(stats).length}`);
    console.log('================================================\n');
  } catch (error) {
    console.error('Benchmark failed:', error);
  }
}

runBenchmark();
