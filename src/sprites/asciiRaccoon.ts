import type { Frame, SpriteSheet } from './types';

/**
 * The ASCII raccoon. Pure data: every animation is a list of frames, every frame a list
 * of text rows. `@` marks an eye; the renderer swaps it for the right glyph so blinking
 * and expressions don't need extra frames. Frames face right and are padded to a common
 * size at load time, so rows don't need trailing spaces.
 *
 * To add or change an animation, edit the rows below; see README "Adding animations".
 */

/** Turns a raw multi-line block into frame rows (drops the first and last line breaks). */
function art(block: string): Frame {
  return block.replace(/^\n/, '').replace(/\n\s*$/, '').split('\n');
}

const idle = [
  art(String.raw`
 .=.          /\___/\
(#=#)        ( =@ @= )
 \=#\________/\  v  /
  \#(____________)
      ll ll   ll ll
`),
  art(String.raw`
              /\___/\
 .=#=.       ( =@ @= )
(#=#=#\______/\  v  /
  '=#(____________)
      ll ll   ll ll
`),
  art(String.raw`
              /\___/\
             ( =@ @= )
  ___________/\  v  /
 (#=#=#=#(____________)
  '=#=#'  ll ll   ll ll
`),
];

const walk = [
  art(String.raw`
              /\___/\
 .=#=.       ( =@ @= )
(#=#=#\______/\  v  /
  '=#(____________)
     /l /l   /l /l
`),
  art(String.raw`
              /\___/\
 .=#=.       ( =@ @= )
(#=#=#\______/\  v  /
  '=#(____________)
      ll ll   ll ll
`),
  art(String.raw`
              /\___/\
 .=#=.       ( =@ @= )
(#=#=#\______/\  v  /
  '=#(____________)
       l\ l\   l\ l\
`),
  art(String.raw`
              /\___/\
 .=#=.       ( =@ @= )
(#=#=#\______/\  v  /
  '=#(____________)
      ll ll   ll ll
`),
];

const run = [
  art(String.raw`
               /\___/\
=#=#=#=._______( =@ @= )
       (_______/\  w  /
     //  \\    //  \\
`),
  art(String.raw`
               /\___/\
=#=#=#=._______( =@ @= )
       (_______/\  w  /
       \\ //    \\ //
`),
];

const jump = [
  art(String.raw`
                /\___/\
 =#=#=._______ ( =@ @= )
       (_______/\  o  /
        <<  <<
`),
  art(String.raw`
              /\___/\
=#=#=#.______( =@ @= )
      (______/\  o  /
       \\ \\  \\ \\
`),
];

const float = [
  art(String.raw`
              /\___/\
 .=#=.       ( =@ @= )
(#=#=#\______/\  u  /
  '=#(____________)
      vv vv   vv vv
       ~   ~    ~
`),
  art(String.raw`
              /\___/\
 .=#=.       ( =@ @= )
(#=#=#\______/\  u  /
  '=#(____________)
      vv vv   vv vv
        ~   ~    ~
`),
];

const sitRows = (face: string, mouth: string, pawRow: string): Frame =>
  art(String.raw`
        /\___/\
       ${face}
  .=.   \  ${mouth}  /${pawRow}
 (#=#)_/       \
  '=#=(_________)
        ll    ll
`);

const sit = [sitRows('( =@ @= )', 'v', ''), sitRows('( =@ @= )', 'v', '')];

const groom = [
  sitRows('( =@ @= )', 'v', ''),
  sitRows('( =@ @= )', 'w', 'o'),
  sitRows('( =@ @=)o', 'w', ''),
  sitRows('( =@ @= )', 'w', 'o'),
];

const yawn = [
  sitRows('( =@ @= )', 'v', ''),
  sitRows('( =@ @= )', 'o', ''),
  sitRows('( =@ @= )', 'O', ''),
  sitRows('( =@ @= )', 'O', ''),
  sitRows('( =@ @= )', 'o', ''),
  sitRows('( =@ @= )', 'v', ''),
];

const confused = [
  sitRows('( =@ @= )', '~', ''),
  sitRows('(=@ @=  )', '~', ''),
  sitRows('( =@ @= )', '~', ''),
  sitRows('(  =@ @=)', '~', ''),
];

/** Head and paws over the floor edge; the renderer clips everything below the floor. */
const peekRows = (eyes: string): Frame =>
  art(String.raw`
 /\___/\
${eyes}
/\  v  /\
|_|___|_|
`);

const peek = [peekRows('( =@ @= )'), peekRows('(=@ @=  )'), peekRows('( =@ @= )'), peekRows('(  =@ @=)')];

const sleep = [
  art(String.raw`
      _.-=#=#=-._
    .'  /\___/\  '.
   (#=#( =@ @= )___)
`),
  art(String.raw`
      _.-=#=#=-._
    .'  /\___/\   '.
   (#=#( =@ @= )____)
`),
];

const chase = [
  art(String.raw`
               /\___/\
=#=#=#=._______( =@ @= )
       (_______/\  w  />
     //  \\    //  \\
`),
  art(String.raw`
               /\___/\
=#=#=#=._______( =@ @= )
       (_______/\  w  />
       \\ //    \\ //
`),
];

const surprised = [
  art(String.raw`
    '  |  '    /|___|\
 \#=#=#/     ( =@ @= )
  \=#=#\_____/\  o  /
   \#(____________)
     /l /l   l\ l\
`),
  art(String.raw`
   '   |   '   /|___|\
 \#=#=#/     ( =@ @= )
  \=#=#\_____/\  O  /
   \#(____________)
     /l /l   l\ l\
`),
];

const dangle = [
  art(String.raw`
 /\___/\
( =@ @= )
 \  o  /
 /|   |\
 l|   |l
  '=#='
   =#=
`),
  art(String.raw`
 /\___/\
( =@ @= )
 \  o  /
 /|   |\
 l|   |l
   '=#='
    =#=
`),
];

export const asciiRaccoon: SpriteSheet = {
  name: 'ascii-raccoon',
  eyeMarker: '@',
  eyeGlyphs: { open: 'o', blink: '-', closed: '-', wide: 'O' },
  animations: {
    // Tail sweeps up, middle, down, middle.
    idle: { frames: [idle[0], idle[1], idle[2], idle[1]], fps: 2.5, loop: true, eyes: 'open' },
    walk: { frames: walk, fps: 8, loop: true, eyes: 'open' },
    run: { frames: run, fps: 12, loop: true, eyes: 'open' },
    jump: { frames: jump, fps: 6, loop: false, eyes: 'wide' },
    float: { frames: float, fps: 3, loop: true, eyes: 'open' },
    sit: { frames: sit, fps: 1, loop: true, eyes: 'open' },
    groom: { frames: groom, fps: 4, loop: true, eyes: 'closed' },
    yawn: { frames: yawn, fps: 3, loop: false, eyes: 'closed' },
    peek: { frames: peek, fps: 0, loop: true, eyes: 'open', driver: 'keystrokes' },
    sleep: { frames: sleep, fps: 0.7, loop: true, eyes: 'closed' },
    chase: { frames: chase, fps: 14, loop: true, eyes: 'wide' },
    surprised: { frames: surprised, fps: 8, loop: true, eyes: 'wide' },
    confused: { frames: confused, fps: 1.5, loop: true, eyes: 'open' },
    dangle: { frames: dangle, fps: 3, loop: true, eyes: 'wide' },
  },
};
