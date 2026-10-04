import {makeProject} from '@revideo/core';
import regular from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url';
import bold from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2?url';
import pixel from '../fonts/PressStart2P-Regular.ttf?url';
import stills from './scenes/stills?scene';

for (const [family, url, weight] of [['JetBrains Mono', regular, '400'], ['JetBrains Mono', bold, '700'], ['Press Start 2P', pixel, '400']]) {
  const face = new FontFace(family, `url(${url})`, {weight});
  document.fonts.add(await face.load());
}

export default makeProject({
  scenes: [stills],
  settings: {
    shared: {size: {x: 1920, y: 1080}, background: '#0e0620'},
    rendering: {fps: 30, exporter: {name: '@revideo/core/wasm'}},
  },
});
