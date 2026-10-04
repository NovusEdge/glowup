import { useEffect, useRef } from 'react'
import type { Look } from './data.ts'
import { ditherColors } from './dither-colors.ts'
import { useReducedMotion, useVisible } from './motion.ts'

export { ditherColors }

// The canvas renders at 1/DITHER_PX resolution and scales up pixelated, so each dither dot is DITHER_PX css px.
export const DITHER_PX = 3

const VS = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'
const FS = `precision highp float;
uniform vec2 r;uniform float t,amt,sy;uniform vec3 c0,c1,c2;
float h(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float n(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h(i),h(i+vec2(1,0)),f.x),mix(h(i+vec2(0,1)),h(i+1.),f.x),f.y);}
float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*n(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return v;}
float b2(vec2 a){a=floor(a);return fract(dot(a,vec2(.5,a.y*.75)));}
float b4(vec2 a){return b2(.5*a)*.25+b2(a);}
float b8(vec2 a){return b4(.5*a)*.25+b2(a);}
void main(){
  vec2 g=gl_FragCoord.xy; vec2 uv=g/r.y; uv.y-=sy;
  vec2 w=vec2(fbm(uv*1.4+vec2(t*.035,0.)),fbm(uv*1.4+vec2(5.2,1.3)-vec2(0.,t*.03)));
  float f=fbm(uv*1.8+w*2.2+vec2(-t*.02,t*.015));
  float top=gl_FragCoord.y/r.y;
  float m=amt*(.55+.6*smoothstep(.15,1.,top));
  float side=abs(gl_FragCoord.x/r.x-.5)*2.;
  m*=.55+.45*smoothstep(.25,1.,side);
  float v=clamp((f-.28)*2.6*m,0.,1.);
  float d=b8(g);
  vec3 col=c0;
  if(v>d*.5+.18) col=c1;
  if(v>d*.5+.5) col=c2;
  gl_FragColor=vec4(col,1.);
}`

const rgb = (hex: string) => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)

export function Dither(props: { look: Look }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  const visible = useVisible()
  const cols = useRef(ditherColors(props.look))
  cols.current = ditherColors(props.look)
  const redraw = useRef<() => void>(() => {})

  // Colors change without tearing down the GL context; a paused (reduced-motion) canvas repaints once.
  useEffect(() => { redraw.current() }, [props.look])

  useEffect(() => {
    const cv = ref.current
    const gl = cv?.getContext('webgl', { antialias: false, premultipliedAlpha: false })
    if (!cv || !gl) { if (cv) cv.style.display = 'none'; return }
    cv.style.display = ''
    const sh = (type: number, src: string) => {
      const s = gl.createShader(type)!
      gl.shaderSource(s, src); gl.compileShader(s)
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s))
      return s
    }
    const pr = gl.createProgram()!
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS))
    gl.linkProgram(pr); gl.useProgram(pr)
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW)
    const loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0)
    const U = (n: string) => gl.getUniformLocation(pr, n)
    let t0 = performance.now()
    const draw = (now: number) => {
      const w = Math.ceil(innerWidth / DITHER_PX), h = Math.ceil(innerHeight / DITHER_PX)
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h) }
      gl.uniform2f(U('r'), w, h); gl.uniform1f(U('t'), reduced ? 0 : (now - t0) / 1000)
      gl.uniform1f(U('amt'), 1 - Math.min(scrollY / innerHeight, 1) * 0.45)
      gl.uniform1f(U('sy'), scrollY / innerHeight * 0.35)
      cols.current.forEach((c, i) => gl.uniform3fv(U(`c${i}`), rgb(c)))
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    }
    redraw.current = () => draw(performance.now())
    draw(t0)
    if (reduced || !visible) return () => { redraw.current = () => {} }
    let raf = 0
    const frame = (now: number) => { draw(now); raf = requestAnimationFrame(frame) }
    raf = requestAnimationFrame(frame)
    return () => { cancelAnimationFrame(raf); redraw.current = () => {} }
  }, [reduced, visible])

  return <canvas ref={ref} className="dither" aria-hidden="true" style={{ position: 'fixed', inset: 0, zIndex: 0, width: '100%', height: '100%', imageRendering: 'pixelated', pointerEvents: 'none' }} />
}
