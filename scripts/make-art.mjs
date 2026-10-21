// Generates the placeholder "artworks": layered gradients, no real art involved.
import { mkdirSync, writeFileSync } from 'node:fs'

const pieces = {
  'nl-001': ['#1d3557', '#e76f51', '#f4a261'],
  'nl-002': ['#0b3d2e', '#2a9d8f', '#e9c46a'],
  'nl-003': ['#22333b', '#5e6472', '#c6ac8f'],
  'nl-004': ['#3d1e6d', '#c06c84', '#f8b195'],
  'sv-001': ['#1b4332', '#52b788', '#d8f3dc'],
  'sv-002': ['#606c38', '#283618', '#dda15e'],
  'sv-003': ['#2d6a4f', '#95d5b2', '#f1faee'],
  'sv-004': ['#081c15', '#40916c', '#ffd166'],
}

mkdirSync('public/art', { recursive: true })
for (const [name, [a, b, c]] of Object.entries(pieces)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient>
    <radialGradient id="r" cx="0.7" cy="0.3" r="0.6"><stop offset="0" stop-color="${c}" stop-opacity="0.9"/><stop offset="1" stop-color="${c}" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="400" height="500" fill="url(#g)"/>
  <rect width="400" height="500" fill="url(#r)"/>
  <path d="M0 360 C 120 300, 240 420, 400 340 L 400 500 L 0 500 Z" fill="${a}" opacity="0.55"/>
</svg>
`
  writeFileSync(`public/art/${name}.svg`, svg)
}
console.log(`wrote ${Object.keys(pieces).length} placeholder artworks`)
