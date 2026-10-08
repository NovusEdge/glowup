type P = React.SVGProps<SVGSVGElement>

const base = { viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor', strokeWidth: 1.5, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const

export const CopyIcon = (p: P) => <svg {...base} {...p}><rect x="5.5" y="5.5" width="8" height="8" rx="1.5" /><path d="M10.5 5.5v-2a1 1 0 0 0-1-1h-6a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2" /></svg>
export const CheckIcon = (p: P) => <svg {...base} {...p}><path d="m3 8.5 3.2 3L13 4.5" /></svg>
export const ArrowRightIcon = (p: P) => <svg {...base} {...p}><path d="M3 8h10M9 4l4 4-4 4" /></svg>
export const ChevronDownIcon = (p: P) => <svg {...base} {...p}><path d="m4 6 4 4 4-4" /></svg>
export const ChevronRightIcon = (p: P) => <svg {...base} {...p}><path d="m6 4 4 4-4 4" /></svg>
export const ChevronUpIcon = (p: P) => <svg {...base} {...p}><path d="m4 10 4-4 4 4" /></svg>
export const XIcon = (p: P) => <svg {...base} {...p}><path d="m4 4 8 8M12 4l-8 8" /></svg>
export const DownloadIcon = (p: P) => <svg {...base} {...p}><path d="M8 2.5v8M4.5 7 8 10.5 11.5 7M3 13.5h10" /></svg>
export const LinkIcon = (p: P) => <svg {...base} {...p}><path d="M6.5 9.5a2.8 2.8 0 0 0 4 0l2-2a2.8 2.8 0 0 0-4-4l-.7.7M9.5 6.5a2.8 2.8 0 0 0-4 0l-2 2a2.8 2.8 0 0 0 4 4l.7-.7" /></svg>
export const SendIcon = (p: P) => <svg {...base} {...p}><path d="M2.5 8h7M7 4.5 10.5 8 7 11.5M13.5 3v10" /></svg>
export const StarIcon = (p: P) => <svg {...base} {...p}><path d="m8 2 1.8 3.7 4 .6-2.9 2.8.7 4L8 11.2l-3.6 1.9.7-4-2.9-2.8 4-.6z" /></svg>
