// Sample content for guest mode, so someone looking at the app without an
// account (a recruiter from a resume link, say) can click through every main
// feature with realistic-looking data. Nothing here touches Supabase: likes,
// RSVPs and new posts made as a guest only live in memory on that device.

export const DEMO_SCHOOL = 'UC Santa Cruz';

export interface DemoEvent {
  id: string;
  title: string;
  description: string;
  location: string;
  latitude: number;
  longitude: number;
  host: string;
  postedBy: string;
  category: string;
  likeCount: number;
  rsvpers: string[];
  rsvpCount: number;
  capacity: number | null;
  // Days from today + local time; turned into a naive timestamp at runtime so
  // the sample events are always upcoming.
  dayOffset: number;
  time: string; // "HH:MM"
  postedHoursAgo: number;
  tags: string[];
  comments: { user: string; text: string; hoursAgo: number }[];
}

const RAW: DemoEvent[] = [
  {
    id: 'demo-1', title: 'Open Mic Night', category: 'music',
    description: 'Bring a song, a poem, or just come listen. Sign-up sheet opens at 7.',
    location: 'Stevenson Event Center', latitude: 36.9973, longitude: -122.0519,
    host: 'Slug Sound Collective', postedBy: '@mariaq', likeCount: 24,
    rsvpers: ['@jaylen', '@sofi.r', '@kai'], rsvpCount: 17, capacity: 120,
    dayOffset: 0, time: '19:30', postedHoursAgo: 5, tags: ['openmic', 'music'],
    comments: [
      { user: '@kai', text: 'Is there a piano?', hoursAgo: 3 },
      { user: '@mariaq', text: 'Yes! Keyboard and two mics.', hoursAgo: 2 },
    ],
  },
  {
    id: 'demo-2', title: 'Tech Career Fair Prep', category: 'career',
    description: 'Resume reviews with alumni from local startups, plus a quick talk on what recruiters look for.',
    location: 'Baskin Engineering 2, Room 165', latitude: 37.0005, longitude: -122.0631,
    host: 'Women in Computing', postedBy: '@angelica', likeCount: 31,
    rsvpers: ['@devon', '@lina.c', '@marcus'], rsvpCount: 42, capacity: 60,
    dayOffset: 1, time: '16:00', postedHoursAgo: 20, tags: ['career', 'resume'],
    comments: [{ user: '@lina.c', text: 'Do we need to bring printed copies?', hoursAgo: 8 }],
  },
  {
    id: 'demo-3', title: 'Free Pizza + Study Session', category: 'food',
    description: 'Midterm season fuel. Pizza while it lasts, quiet tables upstairs.',
    location: 'McHenry Library', latitude: 36.9957, longitude: -122.0589,
    host: 'Peer Tutoring Center', postedBy: '@tutoring', likeCount: 58,
    rsvpers: ['@noah', '@em', '@priya'], rsvpCount: 66, capacity: null,
    dayOffset: 1, time: '18:00', postedHoursAgo: 30, tags: ['freefood', 'midterms'],
    comments: [],
  },
  {
    id: 'demo-4', title: 'Pickup Soccer', category: 'sports',
    description: 'All levels. We split teams when we get there. Bring water.',
    location: 'East Field', latitude: 36.9931, longitude: -122.0533,
    host: '@jaylen', postedBy: '@jaylen', likeCount: 12,
    rsvpers: ['@marcus', '@kai'], rsvpCount: 14, capacity: 22,
    dayOffset: 2, time: '15:00', postedHoursAgo: 12, tags: ['soccer'],
    comments: [{ user: '@devon', text: 'Count me in for next week too', hoursAgo: 4 }],
  },
  {
    id: 'demo-5', title: 'Latinx Heritage Mixer', category: 'social',
    description: 'Music, snacks, and a chance to meet the clubs. Everyone welcome.',
    location: 'Merrill Cultural Center', latitude: 37.0002, longitude: -122.0532,
    host: 'El Centro', postedBy: '@elcentro', likeCount: 40,
    rsvpers: ['@sofi.r', '@angelica', '@luis'], rsvpCount: 38, capacity: 150,
    dayOffset: 3, time: '17:30', postedHoursAgo: 48, tags: ['community'],
    comments: [],
  },
  {
    id: 'demo-6', title: 'Ceramics Workshop', category: 'arts',
    description: 'Learn to throw a bowl on the wheel. Clay and aprons provided.',
    location: 'Porter Art Studios', latitude: 36.9944, longitude: -122.0656,
    host: 'Porter Arts Club', postedBy: '@em', likeCount: 19,
    rsvpers: ['@priya'], rsvpCount: 9, capacity: 12,
    dayOffset: 4, time: '13:00', postedHoursAgo: 26, tags: ['art', 'workshop'],
    comments: [],
  },
  {
    id: 'demo-7', title: 'Intro to Research Labs', category: 'academic',
    description: 'Faculty from psych and CS share how undergrads can join a lab.',
    location: 'Social Sciences 2', latitude: 37.0011, longitude: -122.0585,
    host: 'Undergraduate Research Office', postedBy: '@uro', likeCount: 15,
    rsvpers: ['@lina.c', '@noah'], rsvpCount: 21, capacity: 80,
    dayOffset: 6, time: '12:00', postedHoursAgo: 70, tags: ['research'],
    comments: [],
  },
  {
    id: 'demo-8', title: 'Beach Bonfire', category: 'party',
    description: 'Sunset at Seabright. Carpool from the base of campus at 5.',
    location: 'Seabright State Beach', latitude: 36.9637, longitude: -122.0063,
    host: '@sofi.r', postedBy: '@sofi.r', likeCount: 67,
    rsvpers: ['@kai', '@jaylen', '@em', '@marcus'], rsvpCount: 49, capacity: null,
    dayOffset: 5, time: '18:30', postedHoursAgo: 9, tags: ['beach', 'weekend'],
    comments: [{ user: '@kai', text: 'Bringing marshmallows', hoursAgo: 1 }],
  },
  {
    id: 'demo-9', title: 'Product Design Coffee Chat', category: 'career',
    description: 'Small-group chat with a UX designer about internships and portfolios.',
    location: 'Cafe Iveta', latitude: 36.9764, longitude: -122.0300,
    host: 'Design Collective', postedBy: '@devon', likeCount: 22,
    rsvpers: ['@angelica', '@luis'], rsvpCount: 8, capacity: 10,
    dayOffset: 8, time: '10:00', postedHoursAgo: 40, tags: ['career', 'design'],
    comments: [],
  },
  {
    id: 'demo-10', title: 'Weekly Hiking Club', category: 'sports',
    description: 'Every Saturday morning in the upper campus trails. Meets at the bus stop.',
    location: 'Upper Campus Trailhead', latitude: 37.0068, longitude: -122.0620,
    host: 'Slug Hikers', postedBy: '@noah', likeCount: 28,
    rsvpers: ['@priya', '@em'], rsvpCount: 18, capacity: null,
    dayOffset: 9, time: '08:30', postedHoursAgo: 100, tags: ['hiking', 'weekly'],
    comments: [],
  },
];

function pad(n: number) {
  return String(n).padStart(2, '0');
}

function naiveFromOffset(dayOffset: number, time: string): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${time}:00`;
}

export interface DemoEventResolved extends DemoEvent {
  event_time: string;
  created_at: string;
}

export function getDemoEvents(): DemoEventResolved[] {
  return RAW.map((e) => ({
    ...e,
    event_time: naiveFromOffset(e.dayOffset, e.time),
    created_at: new Date(Date.now() - e.postedHoursAgo * 3600000).toISOString(),
  }));
}

export function getDemoEvent(id: string): DemoEventResolved | null {
  return getDemoEvents().find((e) => e.id === id) ?? null;
}

export function isDemoId(id: string | null | undefined): boolean {
  return !!id && id.startsWith('demo-');
}

export const DEMO_PROFILE = {
  displayName: 'Guest',
  username: 'guest',
  bio: 'Just looking around 👀',
  interests: ['Music', 'Career', 'Free Food', 'Sports'],
  clubs: [
    { name: 'Women in Computing', role: 'Member' },
    { name: 'Slug Hikers', role: 'Member' },
  ],
  following: 128,
  followers: 96,
};

export const DEMO_THREADS = [
  { name: 'Maria Q', username: '@mariaq', last: 'see you at open mic tonight!', time: '2m' },
  { name: 'Women in Computing', username: 'group', last: 'Devon: room changed to BE2 165', time: '1h' },
  { name: 'Jaylen', username: '@jaylen', last: 'soccer at 3?', time: '3h' },
  { name: 'Sofi R', username: '@sofi.r', last: 'carpool leaves at 5', time: '1d' },
];
