// Shared by the stills scene (browser) and render.ts (node), so it stays plain data.
// Every still is held for HOLD seconds; render.ts grabs the frame PICK seconds in, after the
// scene has set the state and Clawd's clip has started.
export const HOLD = 0.5;
export const PICK = 0.2;

export type StillSet = {size: {x: number; y: number}; names: string[]; crop: {y: number; h: number} | null};

// Rendered at twice the size of the image and halved by ffmpeg, which hides the 4:2:0 chroma
// of the mp4 the exporter writes. The form (dock or drawer) follows the aspect ratio, so the
// narrow render is the whole 64-column terminal and `crop` cuts it down to the drawer and band.
export const STILL_SETS: {dock: StillSet; narrow: StillSet} = {
  dock: {size: {x: 2560, y: 1408}, names: ['pane-wide', 'agents'], crop: null},
  narrow: {size: {x: 1312, y: 1212}, names: ['compact'], crop: {y: 620, h: 592}},
};
