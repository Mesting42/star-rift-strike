import { WEAPONS, ITEMS, SKILLS } from './content.js';

// Original hardware illustrations. Filled surfaces and shaded side faces keep
// the silhouette readable at menu size; no external images or icon fonts.
const steel = 'url(#steel)', casing = 'url(#casing)', accent = 'url(#accent)';
const brass = 'url(#brass)', glass = 'url(#glass)', dark = '#172a34';
const path = (d, fill = steel) => `<path d="${d}" fill="${fill}"/>`;
const rect = (x, y, w, h, fill = steel, radius = 0) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${radius}" fill="${fill}"/>`;
const oval = (x, y, rx, ry, fill = steel) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="${fill}"/>`;
const group = (art, transform) => `<g transform="${transform}">${art}</g>`;
const gun = art => group(art, 'rotate(-24 80 60)');
const bolts = points => points.map(([x, y]) => oval(x, y, 2, 2, '#dbe3d7') + oval(x, y + .7, .8, .7, '#5e7174')).join('');
const vents = (x, y, n, vertical = false) => Array.from({ length: n }, (_, i) =>
  rect(x + (vertical ? 0 : i * 6), y + (vertical ? i * 6 : 0), vertical ? 15 : 3, vertical ? 3 : 10, '#233943', 1)).join('');

function receiver(color = accent) {
  return path('M22 46 60 42 75 51 75 78 61 90 24 86 16 74 16 57Z', '#203641')
    + path('M16 52 55 46 68 53 68 76 55 84 20 78 12 69 12 59Z', steel)
    + path('M12 69 20 78 55 84 55 89 20 84 12 76Z', '#516671')
    + rect(23, 54, 30, 17, casing, 2) + rect(24, 54, 29, 4, color, 1)
    + vents(27, 61, 4) + rect(19, 75, 18, 3, '#d2d9c9')
    + bolts([[18, 58], [59, 56], [59, 74]]);
}

function missile(x, y, scale = 1, color = accent) {
  const art = path('M3 14 29 14 37 21 29 28 3 28Z', '#283d46')
    + path('M0 10 29 10 42 19 29 26 0 26Z', steel)
    + path('M29 10 42 19 29 26Z', color)
    + path('M3 10 12 4 17 4 13 10M3 26 12 33 17 33 13 26Z', '#92a9ae')
    + rect(17, 11, 5, 14, '#bd7b54') + rect(1, 14, 4, 8, dark)
    + path('M6 11 27 11 31 14 6 14Z', '#e2e6d5');
  return group(art, `translate(${x} ${y}) scale(${scale})`);
}

function cartridge(x, y, scale = 1, tungsten = false) {
  const art = path('M0 34 7 34 11 12 8 0 2 0 0 12Z', '#394f58')
    + rect(0, 23, 13, 47, tungsten ? steel : brass, 2)
    + path('M0 23 3 7 7 0 11 7 13 23Z', tungsten ? '#d7e3dc' : '#c0d2d2')
    + rect(1, 27, 3, 38, '#fff1c7') + rect(-1, 65, 15, 6, tungsten ? '#728e98' : '#ad7045', 1)
    + rect(0, 66, 13, 2, '#eac58c');
  return group(art, `translate(${x} ${y}) scale(${scale})`);
}

function drone(x, y, scale = 1, color = accent) {
  const art = path('M35 2 43 30 68 48 65 56 43 50 39 62 49 69 47 75 35 70 23 75 21 69 31 62 27 50 5 56 2 48 27 30Z', '#233e48')
    + path('M33 0 40 27 64 45 62 50 40 45 37 58 45 65 44 68 33 64 22 68 21 65 29 58 26 45 4 50 2 45 26 27Z', steel)
    + path('M33 4 37 28 35 58 29 58 29 28Z', '#b4c4bd')
    + path('M31 16 36 16 38 30 29 30Z', glass)
    + path('M6 43 24 34 23 40 6 47M60 43 42 34 43 40 60 47Z', color)
    + rect(25, 53, 5, 9, dark, 1) + rect(36, 53, 5, 9, dark, 1)
    + rect(25, 60, 5, 5, '#7ce5db', 1) + rect(36, 60, 5, 5, '#7ce5db', 1);
  return group(art, `translate(${x} ${y}) scale(${scale})`);
}

function shieldProjector() {
  return path('M28 77 76 69 107 84 60 99 28 91Z', '#273e49')
    + path('M25 72 74 64 104 79 58 92 25 85Z', steel)
    + path('M58 92 104 79 104 87 58 100Z', '#637a85')
    + oval(63, 76, 22, 9, dark) + oval(63, 73, 15, 7, accent)
    + path('M80 15 122 30 118 66 98 89 75 72 62 40Z', '#346b77')
    + path('M78 10 120 25 116 61 96 84 73 67 60 35Z', accent)
    + path('M78 16 96 31 96 76 78 62 66 36Z', '#b5f4e2')
    + path('M96 31 114 29 110 59 96 76Z', '#61bfb9')
    + path('M78 16 113 28 96 31Z', '#dcfff0')
    + bolts([[32, 78], [86, 81]]);
}

const illustrations = {
  weapon: {
    vulcan: () => gun(
      path('M60 43 133 43 143 51 143 65 66 65Z', '#2c414b')
      + rect(54, 37, 83, 12, steel, 3) + rect(57, 56, 84, 12, steel, 3)
      + rect(65, 39, 63, 3, '#dce5d9') + rect(65, 58, 64, 3, '#dce5d9')
      + rect(83, 34, 9, 17, casing, 2) + rect(103, 34, 9, 17, casing, 2)
      + rect(85, 53, 9, 17, casing, 2) + rect(105, 53, 9, 17, casing, 2)
      + rect(134, 36, 9, 14, '#5b7077', 2) + rect(138, 55, 9, 14, '#5b7077', 2)
      + rect(138, 39, 5, 8, dark, 1) + rect(142, 58, 5, 8, dark, 1)
      + receiver() + rect(28, 82, 31, 11, '#7d6348', 2)
      + Array.from({ length: 5 }, (_, i) => rect(30 + i * 5.5, 81, 4, 10, brass, 1)).join('')),
    scatter: () => gun(
      path('M51 35 120 27 143 40 147 77 126 89 57 79Z', '#2b404b')
      + path('M50 31 117 23 137 36 141 72 120 83 55 74Z', casing)
      + path('M55 31 117 23 137 36 72 43Z', steel)
      + path('M76 42 129 35 139 40 141 72 89 77Z', steel)
      + [0, 1, 2, 3, 4].map(i => oval(91 + i * 9, 50 + (i % 2) * 13, 6, 8, dark) + oval(92 + i * 9, 48 + (i % 2) * 13, 2.5, 4, '#697e80')).join('')
      + rect(79, 70, 49, 5, accent, 1) + receiver()
      + path('M22 77 53 81 53 95 20 90Z', '#b9764c')),
    rail: () => gun(
      path('M58 37 146 32 150 43 71 48Z', '#607983')
      + path('M62 67 147 62 151 74 70 80Z', '#536b75')
      + path('M53 31 143 27 148 36 61 42Z', steel)
      + path('M57 61 146 56 150 66 64 72Z', steel)
      + path('M70 44 139 40 141 49 73 54Z', accent)
      + path('M72 48 140 44 140 47 72 51Z', '#e0fff7')
      + path('M77 41 83 40 89 61 83 62M106 38 112 38 118 59 112 60Z', casing)
      + path('M128 35 135 34 142 58 135 59Z', '#9ab3b9')
      + receiver() + rect(24, 79, 25, 6, accent, 1)),
    rocket: () => gun(
      path('M29 35 96 28 133 52 132 83 70 98 26 73Z', '#2e444e')
      + path('M24 29 90 23 126 46 126 76 65 91 22 67Z', casing)
      + path('M24 29 90 23 126 46 63 60Z', steel)
      + missile(57, 19, 1.65) + missile(43, 41, 1.65) + missile(29, 63, 1.65)
      + path('M31 52 42 49 50 82 40 85Z', '#b46e4b')
      + bolts([[27, 43], [33, 68], [118, 70]])),
    beam: () => gun(
      path('M61 38 122 33 139 48 140 68 122 80 63 76Z', casing)
      + rect(56, 37, 58, 37, steel, 7)
      + rect(65, 45, 49, 21, dark, 4)
      + [71, 84, 97].map(x => rect(x, 42, 8, 25, accent, 2) + rect(x + 1, 44, 2, 18, '#d3fff0', 1)).join('')
      + rect(108, 33, 13, 43, '#768e93', 3)
      + oval(123, 55, 12, 21, '#3d5662') + oval(126, 53, 11, 18, steel)
      + oval(130, 53, 7, 13, dark) + oval(132, 53, 4, 9, accent)
      + path('M136 49 153 51 153 54 136 57Z', '#a8f6e6') + receiver()),
    arc: () => gun(
      path('M56 40 84 37 95 44 95 78 65 82Z', casing)
      + rect(65, 40, 30, 33, dark, 5)
      + [0, 1, 2, 3, 4].map(i => rect(65 + i * 5, 38, 3, 39, accent, 2)).join('')
      + path('M91 38 122 24 144 29 144 37 120 34 99 49Z', steel)
      + path('M92 70 124 81 146 73 146 65 124 70 99 60Z', steel)
      + path('M126 26 144 29 144 37 127 34M128 70 146 65 146 73 128 79Z', '#9e8fc1')
      + path('M109 41 120 44 116 49 135 54 121 59 122 65 109 58 115 53 103 49Z', '#efe0ff')
      + receiver()),
    orbit: () => gun(
      path('M37 49 94 38 134 67 112 87 41 85Z', casing)
      + path('M38 43 95 32 131 58 108 78 39 77Z', steel)
      + rect(37, 63, 73, 10, '#456356', 2)
      + group(path('M0-34 11-14 35-17 25 2 36 23 13 22 0 37-10 16-33 19-24-2-34-21-11-19Z', '#547469')
        + path('M0-39 10-19 33-22 25-3 35 18 12 17 0 32-10 11-33 14-25-7-34-26-11-24Z', steel)
        + path('M0-39 10-19 33-22 7-8Z', '#e4edca')
        + oval(0, -4, 16, 16, dark) + oval(0, -4, 11, 11, accent)
        + oval(0, -4, 5, 5, '#e2f2c9') + bolts([[-5, -7], [5, -1]]), 'translate(105 55)')
      + path('M17 58 37 53 47 62 41 78 17 74Z', casing) + rect(21, 59, 12, 5, accent, 1)),
    nova: () => gun(
      path('M39 29 111 25 137 42 144 71 126 90 50 88 29 65Z', '#2b3e48')
      + path('M32 25 105 21 131 38 138 65 120 84 43 82 23 59Z', casing)
      + path('M32 25 105 21 131 38 61 46Z', steel)
      + path('M28 35 50 43 50 73 30 65Z', accent)
      + [59, 73, 87].map(x => rect(x, 48, 8, 26, brass, 2) + rect(x + 1, 49, 2, 20, '#fff1b8')).join('')
      + path('M112 32 136 41 144 60 137 79 116 86 103 68 103 48Z', steel)
      + path('M116 40 132 46 137 60 131 73 118 77 110 65 111 51Z', dark)
      + oval(124, 59, 9, 14, brass) + oval(126, 59, 5, 9, '#fff5cc')
      + bolts([[35, 30], [48, 77], [109, 34]])),
  },
  item: {
    caliber: () => group(cartridge(32, 25, .95) + cartridge(57, 14, 1.05) + cartridge(85, 23, .95)
      + path('M28 95 100 95 106 103 27 103Z', '#7b624d'), 'rotate(24 80 60)'),
    rapid: () => gun(path('M25 38 92 31 122 50 123 87 53 101 24 79Z', '#293f4b')
      + path('M22 30 88 24 116 43 116 78 49 92 22 71Z', steel)
      + path('M49 52 116 43 116 78 49 92Z', casing)
      + rect(28, 43, 20, 21, dark, 2) + rect(31, 46, 14, 6, accent, 1)
      + path('M61 58 120 50 138 65 136 75 119 62 61 70Z', '#68584a')
      + [0, 1, 2, 3, 4, 5, 6].map(i => group(rect(0, 0, 6, 21, brass, 1) + path('M0 0 3-7 6 0Z', '#dbe1d2'), `translate(${65 + i * 10} ${57 - i * .6})`)).join('')
      + bolts([[29, 34], [40, 81], [105, 76]])),
    plating: () => path('M28 53 81 27 134 56 129 87 79 112 29 86Z', '#273e49')
      + path('M26 44 80 18 132 47 127 78 78 104 27 77Z', '#72858b')
      + path('M23 35 77 9 129 38 124 69 75 95 24 68Z', steel)
      + path('M34 36 77 16 116 38 112 63 75 83 34 61Z', '#bcc8c0')
      + path('M77 16 77 56 75 83 112 63 116 38Z', '#8da3a6')
      + path('M42 37 74 23 105 41 74 57Z', '#e0e3d2')
      + path('M52 51 66 59 65 72 51 64Z', '#687e82')
      + bolts([[28, 39], [77, 13], [121, 41], [76, 89]]),
    capacitor: () => path('M30 72 101 58 129 83 62 107 30 93Z', casing)
      + path('M28 66 99 52 127 77 59 99 28 87Z', steel)
      + [0, 1, 2].map(i => group(rect(0, 13, 20, 44, '#426772', 4)
        + rect(0, 8, 20, 44, accent, 4) + oval(10, 9, 10, 5, '#d8fff0')
        + rect(3, 16, 4, 31, '#baf5e7', 2) + rect(7, 0, 6, 8, steel, 1)
        + rect(0, 46, 20, 7, casing, 1), `translate(${42 + i * 26} ${33 - i * 6})`)).join('')
      + bolts([[36, 81], [110, 77]]),
    wing: () => path('M25 76 76 44 143 33 139 55 95 77 76 101 48 102Z', '#325064')
      + path('M19 68 70 36 137 25 133 47 89 69 70 93 42 94Z', steel)
      + path('M70 36 137 25 123 36 71 49 29 75 19 68Z', '#dde5d9')
      + path('M52 54 71 43 79 64 70 83 59 83Z', accent)
      + path('M74 62 126 40 117 50 82 67Z', '#476c81')
      + path('M91 17 112 7 110 25 84 35Z', steel) + bolts([[49, 75], [87, 51]]),
    salvage: () => path('M29 84 59 67 93 80 58 100 29 97Z', casing)
      + path('M27 77 57 60 91 73 56 93 27 90Z', steel)
      + path('M52 69 61 27 74 28 65 72Z', '#607e8a')
      + path('M58 63 68 23 95 36 90 48 74 40 67 69Z', steel)
      + oval(68, 30, 11, 11, casing) + oval(68, 29, 6, 6, brass)
      + path('M87 35 122 29 140 42 139 61 128 66 128 48 117 41 93 47Z', steel)
      + path('M88 42 109 57 111 76 100 84 91 77 99 69 96 58 80 49Z', steel)
      + path('M128 55 139 53 139 61 128 66M100 74 109 72 100 84 91 77Z', accent)
      + bolts([[38, 81], [57, 84]]),
    splitter: () => gun(path('M29 52 109 36 136 57 110 88 31 86Z', casing)
      + path('M28 46 108 30 133 51 107 82 28 79Z', steel)
      + missile(56, 22, 1.7) + missile(37, 47, 1.7)
      + path('M21 78 46 70 58 81 55 94 29 101 19 91Z', '#b66648')
      + path('M23 76 46 68 54 77 29 85Z', accent)
      + rect(31, 85, 5, 10, '#f1c58f', 1)),
    conduct: () => path('M26 74 90 54 130 79 66 105 26 92Z', casing)
      + path('M24 68 88 48 128 73 64 99 24 86Z', steel)
      + group(rect(0, 12, 60, 32, dark, 8)
        + rect(0, 8, 11, 43, steel, 3) + rect(49, 8, 11, 43, steel, 3)
        + Array.from({ length: 7 }, (_, i) => rect(9 + i * 6, 4, 4, 48, accent, 2)).join('')
        + rect(14, 9, 3, 32, '#e0d5ff', 1), 'translate(47 25) rotate(-12 30 25)')
      + bolts([[33, 75], [107, 79]]) + rect(48, 86, 22, 4, accent, 1),
    piercer: () => group(path('M33 63 92 54 118 70 114 103 52 110 31 94Z', casing)
      + path('M31 57 90 48 113 63 111 94 49 103 29 87Z', steel)
      + rect(42, 72, 63, 16, dark, 2) + cartridge(42, 15, .91, true)
      + cartridge(64, 11, .91, true) + cartridge(86, 8, .91, true)
      + path('M32 86 108 77 109 93 49 103 31 93Z', '#688993')
      + rect(50, 89, 28, 4, accent, 1), 'rotate(18 80 60)'),
    reactor: () => path('M42 23 98 15 130 45 127 81 91 107 39 90 22 54Z', '#294a50')
      + path('M38 17 94 9 126 39 123 75 87 101 35 84 18 48Z', steel)
      + path('M47 29 89 23 110 43 108 68 84 84 48 73 35 49Z', casing)
      + path('M59 34 84 30 101 47 98 64 81 75 59 67 49 49Z', accent)
      + path('M59 34 81 49 101 47 84 30Z', '#d6ffdf')
      + path('M59 34 49 49 59 67 81 75 81 49Z', '#71c5b3')
      + path('M81 49 98 64 81 75Z', '#ade7c6')
      + [0, 1, 2, 3].map(i => group(rect(36, 46, 16, 8, dark, 1) + rect(38, 47, 10, 3, accent), `rotate(${i * 90} 76 55)`)).join('')
      + bolts([[38, 23], [111, 40], [86, 94], [27, 49]]),
    escort: () => drone(24, 29, .85, '#b3d98c') + drone(76, 10, 1, '#b3d98c'),
    scanner: () => path('M44 86 85 72 118 89 76 107 44 99Z', casing)
      + path('M41 80 82 66 115 83 73 101 41 93Z', steel)
      + path('M71 72 74 42 86 42 90 77 77 84Z', '#6a8490')
      + oval(76, 41, 48, 27, '#445d68')
      + oval(73, 35, 48, 27, steel) + oval(72, 32, 38, 20, '#bdcebb')
      + path('M35 32 71 18 111 30 73 41Z', '#e2e5c7')
      + path('M72 32 113 12 121 16 78 41Z', '#56717b')
      + rect(108, 9, 14, 11, brass, 3) + oval(75, 35, 8, 6, casing)
      + bolts([[51, 87], [95, 84]]),
  },
  skill: {
    emp: () => path('M36 71 76 53 118 75 78 103 36 91Z', casing)
      + path('M32 64 73 46 114 68 74 96 32 84Z', steel)
      + rect(57, 33, 35, 42, casing, 6) + oval(74, 35, 18, 12, steel)
      + oval(74, 33, 11, 7, accent)
      + rect(38, 35, 9, 29, steel, 2) + rect(102, 35, 9, 29, steel, 2)
      + oval(43, 35, 8, 6, accent) + oval(107, 35, 8, 6, accent)
      + path('M62 12 81 12 75 27 89 27 65 51 71 31 59 31Z', '#d7e5ff')
      + [0, 1, 2].map(i => rect(61, 47 + i * 8, 27, 4, accent, 1)).join('')
      + bolts([[41, 78], [97, 73]]),
    shield: shieldProjector,
    bomb: () => group(missile(22, 19, 2.15) + missile(22, 48, 2.15)
      + path('M25 50 125 50 125 59 25 59Z', '#526b75')
      + rect(30, 51, 12, 8, steel, 1) + rect(105, 51, 12, 8, steel, 1), 'rotate(-34 80 60)'),
    drone: () => path('M28 87 57 76 99 91 69 105Z', '#334b50')
      + drone(19, 31, .8, '#b8dc91') + drone(73, 9, 1, '#b8dc91')
      + rect(29, 90, 17, 4, accent, 1) + rect(51, 97, 11, 3, accent, 1),
  },
  resource: {
    heal: () => path('M30 42 107 34 133 50 132 92 53 107 29 88Z', '#2c4747')
      + path('M26 35 103 27 129 43 128 85 49 100 25 81Z', steel)
      + path('M49 52 129 43 128 85 49 100Z', '#789d8a')
      + path('M26 35 103 27 129 43 49 52Z', '#d0dbbf')
      + path('M54 29 54 18 83 14 98 24 89 26 80 21 62 24 62 29Z', '#5d7874')
      + path('M81 54 95 52 95 62 105 60 105 74 94 76 94 87 80 89 80 78 69 80 69 66 81 64Z', '#d8eed0')
      + rect(30, 46, 9, 28, '#506e67', 2) + bolts([[52, 56], [117, 51], [116, 84], [57, 89]]),
    key: () => group(path('M36 25 101 25 127 50 127 97 34 97 34 40Z', '#395a52')
      + path('M30 18 95 18 120 43 120 88 29 88 29 33Z', '#709685')
      + path('M31 21 94 21 117 44 117 86 32 86Z', '#527768')
      + [0, 1, 2, 3, 4, 5].map(i => rect(38 + i * 12, 74, 7, 16, brass, 1)).join('')
      + rect(45, 33, 52, 31, brass, 4) + rect(55, 39, 31, 19, '#896a47', 2)
      + rect(57, 40, 27, 5, '#e5d1a0', 1) + rect(103, 51, 7, 7, steel, 1)
      + rect(37, 57, 7, 7, accent, 1), 'rotate(-14 80 60)'),
    shield: shieldProjector,
  },
};

const palette = new Map([
  ...WEAPONS.map(item => [`weapon:${item.id}`, item.color]),
  ...ITEMS.map(item => [`item:${item.id}`, item.color]),
  ...SKILLS.map(item => [`skill:${item.id}`, item.color]),
  ['heal:heal', '#a9d69b'], ['key:key', '#e8cd83'], ['shield:shield', '#92e2dd'],
]);
let illustrationId = 0;

export function equipmentArt(kind, value) {
  const id = typeof value === 'object' ? value?.id : value;
  const resource = illustrations.resource[kind];
  const draw = illustrations[kind]?.[id] || resource;
  const safeKind = String(kind || 'heal').replace(/[^a-z0-9-]/gi, '');
  const safeId = String(id || kind || 'heal').replace(/[^a-z0-9-]/gi, '');
  const color = palette.get(`${kind}:${resource ? kind : id}`) || '#bacbbb';
  const prefix = `equipment-${++illustrationId}`;
  const defs = `<defs>
    <linearGradient id="steel" x1="0" y1="0" x2=".65" y2="1"><stop stop-color="#e5e8d9"/><stop offset=".38" stop-color="#bdccc5"/><stop offset="1" stop-color="#6e8791"/></linearGradient>
    <linearGradient id="casing" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#59747d"/><stop offset="1" stop-color="#203743"/></linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#f3f6de"/><stop offset=".28" stop-color="${color}"/><stop offset="1" stop-color="${color}" stop-opacity=".7"/></linearGradient>
    <linearGradient id="brass" x1="0" y1="0" x2="1" y2=".4"><stop stop-color="#ffe0a0"/><stop offset=".3" stop-color="#d3aa67"/><stop offset="1" stop-color="#8d6244"/></linearGradient>
    <linearGradient id="glass" x1="0" y1="0" x2=".5" y2="1"><stop stop-color="#a6e5db"/><stop offset=".3" stop-color="#517e89"/><stop offset="1" stop-color="#132c3a"/></linearGradient>
    <radialGradient id="shadow"><stop stop-color="#020c11" stop-opacity=".75"/><stop offset="1" stop-color="#020c11" stop-opacity="0"/></radialGradient>
  </defs>`;
  const art = `${defs}${oval(82, 101, 70, 14, 'url(#shadow)')}${(draw || illustrations.resource.heal)()}`
    .replace(/id="([a-z]+)"/g, (_, name) => `id="${prefix}-${name}"`)
    .replace(/url\(#([a-z]+)\)/g, (_, name) => `url(#${prefix}-${name})`);
  return `<span class="equipment-art" data-equipment="${safeKind}:${safeId}" aria-hidden="true"><svg viewBox="0 0 160 120" xmlns="http://www.w3.org/2000/svg" focusable="false">${art}</svg></span>`;
}
