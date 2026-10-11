import type { Act, ActInput } from './act';
import { FOX_SCALE } from './build';
import { catAct } from './catAct';
import { noise1, span, wave } from './kit';
import type { PoseKey } from './pose';

/**
 * How a red fox holds itself. A fox moves very like a cat (the same light, deliberate walk
 * placing each hind paw in the print of the front one, the same sit with the brush wrapped
 * round the paws, the same curl asleep), so it takes the cat's poses, drawn longer and
 * taller to its build. What differs is the tail: a fox carries its brush low and straight
 * out behind, never up like a cat's, and wags it low when it's pleased.
 */

const ALONG: PoseKey[] = ['px', 'sx', 'hx', 'fnx', 'ffx', 'bnx', 'bfx', 'fspread', 'bspread'];
const UP: PoseKey[] = ['py', 'sy', 'hy', 'fny', 'ffy', 'bny', 'bfy', 'arch'];

export function foxAct(input: ActInput): Act {
  const act = catAct(input);
  const p = act.pose;
  for (const key of ALONG) p[key] *= FOX_SCALE.x;
  for (const key of UP) p[key] *= FOX_SCALE.y;
  const { animation, t, clock } = input;
  switch (animation) {
    case 'idle':
      // Hanging down in a loose curve behind the hocks.
      p.tailA = 122 + noise1(clock / 2600, 3) * 6;
      p.tailBend = 1.2;
      p.tailCurl = 6;
      p.tailStiff = 0.55;
      break;
    case 'walk':
      // Held out straight behind, a little below the line of the back.
      p.tailA = 166 + wave(input.phase, 1, 0.1) * 3;
      p.tailBend = 0.9;
      p.tailCurl = 4;
      p.tailStiff = 0.5;
      p.tailSide = 0.1;
      break;
    case 'run':
    case 'chase':
      // Streaming out level behind for balance.
      p.tailA = 182;
      p.tailBend = 0.3;
      p.tailCurl = 2;
      break;
    case 'happy': {
      // Pleased: ears back, brush low and wagging.
      const wag = wave(t, 420) * span(t, 200, 600);
      p.tailA = 150;
      p.tailBend = 1.5;
      p.tailCurl = 6;
      p.tailStiff = 0.6;
      p.tailSide = wag * 0.7;
      break;
    }
  }
  return act;
}
