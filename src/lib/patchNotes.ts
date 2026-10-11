export interface PatchNote {
  /** ISO date, newest first. */
  date: string;
  title: string;
  changes: string[];
}

// Hand-written rather than generated from commits: a commit log says what changed in the
// code, which is not the same as what changed for someone watching their pet. Add a new
// entry at the top when you ship something worth noticing.
export const PATCH_NOTES: PatchNote[] = [
  {
    date: '2026-10-11',
    title: 'A fox and an otter',
    changes: [
      'A fox: a red fox in black stockings, an arctic fox in its winter coat, or one in ink. It walks with the light step of a cat, carries its white-tipped brush low behind, and sleeps curled up in it.',
      'An otter that swims instead of walking. It paddles about your screen in its own little patch of water, with ripples and a wake behind it. When it’s excited it porpoises, and it treads water to look about. It rests floating on its back with its paws on its chest.',
      'The cats’ tails no longer show a cut end where they leave the body. A sitting cat’s haunch reads as one smooth curve, and standing at ease its tail hangs in a relaxed curve.',
    ],
  },
  {
    date: '2026-10-11',
    title: 'Real gallops, a living tail',
    changes: [
      'Running and galloping, each paw lands in turn, the way cats and raccoons really run, instead of two at a time.',
      'The tail has a mind of its own: it holds still a while, swishes across to the other side and back, settles somewhere new, or flicks its tip.',
      'Sitting facing you, the cat wraps its tail round its paws along the floor, instead of the tail showing through its leg.',
      'The shadow cat’s rump is rounded and flows into its tail, with no knob on its hips.',
      'A version number in the settings, and these notes.',
    ],
  },
  {
    date: '2026-10-11',
    title: 'No more moonwalking',
    changes: [
      'Chasing the cursor, he runs round in curves and always faces the way he’s going, so his paws no longer slide backwards.',
      'Legs never stretch longer than they are: the shoulder blade slides forward to reach, like a real cat’s.',
      'Stood up on his hind legs, the raccoon’s arms come from his chest instead of from under his cheeks.',
      'Watching the pointer, his eyes follow it and his head catches up lazily, instead of tracking it exactly.',
      'Excited leaps are quicker, and the paws no longer drag at take-off and landing.',
    ],
  },
  {
    date: '2026-10-11',
    title: 'Turns, petting and zoomies',
    changes: [
      'Turning, the shoulders lead and the hips follow, the back bending into the turn; turning on the spot, he steps round on his paws.',
      'No more hearts: petted, he leans into your hand and enjoys it. Keep stroking to keep him happy.',
      'He leaps with excitement while chasing the cursor, and now and then gets the zoomies.',
    ],
  },
  {
    date: '2026-10-10',
    title: 'Three ways to draw a real animal',
    changes: [
      'The storybook, ink sketch and shadow pets stay; the other styles are retired.',
      'Steps are coordinated, and he faces up and down the screen as well as across it.',
      'Wherever you grab him, you end up holding him by the scruff.',
    ],
  },
  {
    date: '2026-10-10',
    title: 'Lifelike pets',
    changes: [
      'New raccoons and cats that move like the real animals: planted paws, a tail with weight, glances, blinks and ear flicks.',
      'More art styles to choose from in the settings.',
    ],
  },
  {
    date: '2026-10-09',
    title: 'A cat',
    changes: ['A black cat joins the raccoons.'],
  },
  {
    date: '2026-10-08',
    title: 'Choose your raccoon',
    changes: [
      'Pick a raccoon in the settings: cartoon, plush, classic, or a 3D one seen from above that turns any way he goes.',
      'In the browser, the raccoon reacts to your typing while the page is focused.',
    ],
  },
  {
    date: '2026-10-07',
    title: 'Hello, raccoon',
    changes: [
      'A raccoon that lives on your screen: it wanders, grooms, yawns and naps.',
      'Shake the mouse and it chases the cursor, pounces when it stops, and sits looking confused.',
      'Drag it to move it. If you opt in, it peeks up from the bottom of the screen to watch you type.',
    ],
  },
];

export const LATEST_PATCH_NOTE: PatchNote = PATCH_NOTES[0]!;
