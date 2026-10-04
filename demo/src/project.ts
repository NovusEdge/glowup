import {makeProject} from '@revideo/core';
import regular from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-400-normal.woff2?url';
import bold from '@fontsource/jetbrains-mono/files/jetbrains-mono-latin-700-normal.woff2?url';
import launch from './scenes/launch?scene';

// Canvas text only sees a font once it is in document.fonts and loaded; the scene's first
// frame would otherwise draw in the fallback face.
for (const [weight, url] of [['400', regular], ['700', bold]]) {
  const face = new FontFace('JetBrains Mono', `url(${url})`, {weight});
  document.fonts.add(await face.load());
}

export default makeProject({
  scenes: [launch],
  settings: {
    shared: {size: {x: 1920, y: 1080}, background: '#07070a'},
    rendering: {fps: 30, exporter: {name: '@revideo/core/wasm'}},
  },
});
