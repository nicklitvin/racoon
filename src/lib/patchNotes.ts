export interface PatchNote {
  /** ISO date, newest first. */
  date: string;
  title: string;
  changes: string[];
  /**
   * Brings in something still in beta: the note gets a Beta tag and a switch to try it
   * (the `beta` setting), and it stays out of the settings until that's on.
   */
  beta?: boolean;
}

// Hand-written rather than generated from commits: a commit log says what changed in the
// code, which is not the same as what changed for someone watching their pet. Add a new
// entry at the top when you ship something worth noticing.
export const PATCH_NOTES: PatchNote[] = [
  {
    date: '2026-10-24',
    title: 'Updates itself',
    changes: [
      'My Pet checks for a new version every few hours. When there is one, the settings say so at the top: click Update now and it downloads and installs it, then opens again by itself. On a Mac, it opens the new version for you to drag into Applications.',
      'Desktop → Updates has a button to check now.',
    ],
  },
  {
    date: '2026-10-23',
    title: 'Smoother play',
    changes: [
      'Playing with a block, your pet no longer slides about or spins round: it pulls up where it means to instead of overshooting and skidding back, pounces only forwards, and goes to the near side of a block rather than round it.',
      'Turning right round, your pet no longer flickers back and forth between the two ways round.',
      'The raccoon’s trash can is gone.',
    ],
  },
  {
    date: '2026-10-22',
    title: 'A trash can, new games and more hats',
    changes: [
      'The raccoon has a trash can in play mode. Now and then he climbs in, digs about with just his bottom and tail sticking out, pops up with a block he’s found and throws it out. With lots of blocks lying about, he tidies one away in it. Blocks you throw in go in too.',
      'More ways to play with the blocks: a sniff first (and sometimes they lose interest), nosing a block along the floor, trotting off with it in their mouth, creeping up low before a pounce, or charging straight through it. They head straight for a block now instead of running round it first.',
      'Typing away (with keyboard reactions on), your pet comes down to the middle of the bottom of the screen and asks you to play instead.',
      'Ten new hats: cowboy, chef, pirate, viking, Santa, propeller cap, graduation cap, flower crown, sombrero and beret.',
      'The bunny and the hedgehog look like themselves: the bunny has long floppy ears that flap as it hops, big hind feet and a round bottom; the hedgehog is a low dome of spines with a pointed snout and a shiny black nose.',
      'The puffball is gone. If it was your pet, you have the raccoon now.',
    ],
  },
  {
    date: '2026-10-22',
    title: 'My Pet is a window now',
    changes: [
      'My Pet opens as a window in your taskbar or Dock, and you can find it in the Start menu. Your pet is out while it’s open: minimise it and the pet stays, close it and the pet goes too.',
      'One download each for Windows and Mac, and a smaller one.',
    ],
  },
  {
    date: '2026-10-22',
    title: 'A floating puffball',
    beta: true,
    changes: [
      'A new pet to try out: a round pink puffball. It doesn’t walk: it floats about a little off the floor, puffing itself up and flapping its little arms as it goes, and only comes down to sit, nap or work at its desk. It breathes in its blocks, too.',
      'Switch on beta pets at the top and it joins the pets in the settings. Switch it off again and you’re back to the raccoon.',
    ],
  },
  {
    date: '2026-10-22',
    title: 'Costumes',
    changes: [
      'Six whole costumes, not just something round the neck: a dino onesie with spikes down its back, a bee costume with wings and antennae, a space suit with a bubble helmet, knight’s armour with a plumed helmet, a wizard robe covered in stars, and a tutu.',
      'And a wizard hat to go with the robe.',
    ],
  },
  {
    date: '2026-10-21',
    title: 'Racoon is now My Pet',
    changes: ['The app has a new name: My Pet, since your pet can be a cat or an otter too. Your settings come with it.'],
  },
  {
    date: '2026-10-17',
    title: 'A cleaner settings panel',
    changes: [
      'The settings are tidier: each mode is a little moving picture of your pet doing it (playing with its blocks, working at its desk, asleep, running off), and hats and outfits are picture tiles.',
      'The settings scroll properly again when there’s more than fits.',
      'Fewer words: the long descriptions are gone. The typing privacy note is still there, one tap away.',
    ],
  },
  {
    date: '2026-10-16',
    title: 'Modes, and eight ways to walk',
    changes: [
      'Modes: the settings now have four buttons. Play: blocks, chasing the pointer and watching you type. Work: your pet sits at its desk and works for as long as you like; drag it off and it gets cross and goes straight back. Sleep: it curls up and sleeps. Hide: it runs off the screen until you want it back.',
      'The blocks and work-mode switches are gone from the settings (they’re part of Play and Work), and so is tapping the desk to start work.',
      'Your pet now faces the way it’s going in eight directions: walking diagonally you see it three-quarters on, coming towards you or going away, instead of side on and gliding.',
    ],
  },
  {
    date: '2026-10-15',
    title: 'Coming and going',
    changes: [
      'Walking or running up and down the screen, your pet now faces the way it’s going: towards you, you see its face and its paws stepping towards you; going away, you see the back of its head and its tail (a cat’s curled up, a raccoon’s hanging down).',
      'The desk’s monitor faces straight out, and the desk stands properly on its legs instead of looking cut off at the bottom.',
    ],
  },
  {
    date: '2026-10-14',
    title: 'Outfits, and busy at the desk',
    changes: [
      'The pets are pixel art now: the raccoon, the tabby and the otter. If you had another pet, you get the same animal in pixel art (a fox gets the tabby).',
      'New outfits: a suit and tie, pajamas, a sweater and a superhero cape that flies out behind as your pet runs. New hats: a nightcap, to go with the pajamas, and headphones. The dress-up settings are now simple lists to pick from.',
      'At its desk, your pet now switches between tabs: typing away in a terminal, browsing the web with a paw on the mouse, and every once in a while flicking through a few reels and giggling at the funny ones. You can see each on its screen.',
      'You can see the desk’s screen and your pet’s face at once: the monitor faces out, and your pet turns its face to the screen to look at it while it works. The desk stands on two proper legs, with a drawer under the top.',
    ],
  },
  {
    date: '2026-10-14',
    title: 'Dress up, and work mode',
    changes: [
      'Dress up your pet: pick a hat (a party hat, beanie, top hat, crown, cap or bow) and something for its neck (a scarf, bow tie, bandana, or a collar and bell) in the settings. Every pet wears them in its own style, and the settings show yours trying them on.',
      'Work mode: switch it on and a little desk with a computer appears in the corner of the screen. Tap the desk three times and your pet announces it’s work time, sits down at it and types away while you work. Nothing distracts it, and if you tap the desk it’ll shush you.',
      'After 20 minutes of work it gets restless, looks about, then comes and finds your mouse pointer and keeps asking you to play. Give it a pat and it’s delighted, and off it goes to play with its blocks.',
      'Pets now say things in a speech bubble.',
    ],
  },
  {
    date: '2026-10-13',
    title: 'Naps, and a raccoon on two legs',
    changes: [
      'Naps: when nothing has happened for a while, your pet goes for a nap. If you’ve left the mouse pointer resting somewhere, it comes and curls up right next to it. Otherwise it finds somewhere sensible: snuggled up beside a toy block, or tucked into a bottom corner out of the way.',
      'Raccoons now sometimes pick a toy block up in both hands, stand up and toddle off with it on their hind legs, then throw it from there.',
      'The pixel raccoon and tabby have new proportions: a bigger head on a rounder body, a smaller tail, and white brows over the raccoon’s mask.',
      'The pixel pets are down to the raccoon, the tabby and the otter. If you had the black cat, the fox or the green handheld raccoon, you get the nearest one still here.',
      'Chibi and pixel pets no longer show two sets of z’s while they sleep.',
    ],
  },
  {
    date: '2026-10-13',
    title: 'Toy blocks, and pixel pets',
    changes: [
      'Toy blocks: a few wooden alphabet blocks lie about for your pet to play with. It goes over to one and swats it along the floor, or picks it up and flings it (a raccoon throws with both hands), watches where it lands and goes after it. Charging about, it kicks any block in its way.',
      'Throw a block yourself: pick one up and your pet waits with its eyes on it, then races after it when you let go. Click a block to flip it over. You can put the blocks away in the settings.',
      'Pixel pets: a raccoon, a ginger tabby, a black cat, a fox and an otter in chunky pixel art, like sprites from an old game, with pixel blocks to match. There’s also a raccoon in a handheld console’s four shades of green.',
    ],
  },
  {
    date: '2026-10-12',
    title: 'Chibi pets, and better water',
    changes: [
      'Chibi pets: flat 2D cartoon versions of the raccoon, a ginger and a tuxedo cat, the fox and the otter. They have big heads, bean bodies and stubby legs, flip round when they turn, and have little z’s, hearts and question marks floating over them. The chibi otter paddles about in its own little pond and floats on its back holding a shell.',
      'The otter’s water now looks like water: a proper pool round it, with whatever’s under the surface seen through it, instead of a grey ghost of its body.',
      'The otter’s tail lies along the surface instead of sticking up out of the water, and follows it round when it dives.',
    ],
  },
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
