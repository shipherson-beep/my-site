// Asset configuration. Replace files / paths here — no changes to the mechanics code required.
// Any texture set to null falls back to a generated placeholder in the same visual language.
export const CONFIG = {
  lang: 'uk', // 'uk' | 'en'
  meta: {
    title: 'ЖИВА ІСТОТА',
    artist: 'Ship Her Son',
    subtitle: 'X3B Tribute',
  },
  audio: {
    track: 'packed', // 'packed' = masked chunks in assets/audio/t/ ; or a plain path like 'assets/audio/track.mp3'
    volume: 0.9,
    ambience: 0.03,      // room tone level (ducked during playback)
  },
  // Texture aspect guides (any of PNG/JPG/WebP):
  //  sideA / sideB : ~1000×483 sticker. The reel window is cut from x 16.7–83.3 %, y 34–85 % (from top).
  //  coverFront    : J-card front panel, 102×64 mm. Non-matching aspect is fitted ("contain") on coverFill.
  //  coverBack     : J-card back flap (lies in the case under the cassette), 102×64 mm.
  //  jCard         : inside of the front panel (seen when the lid is open), 102×64 mm.
  //  spine         : J-card spine strip, 102×12.5 mm.
  textures: {
    sideA: 'assets/cassette/side-a.png',
    sideB: 'assets/cassette/side-a.png',
    coverFront: 'assets/case/cover-front.png', // portrait art (J-card front is read with the spine at the side)
    coverRotate: 90,     // portrait art turned onto the landscape J-card panel
    coverBack: null,
    jCard: null,
    spine: null,
    coverFill: '#000000',
  },
  // Cassette collection in the cabinet. Put artwork in  assets/collection/<id>/  and list the files, e.g.
  //   files: { front: 'front.jpg', back: 'back.jpg', spine: 'spine.jpg', inside: 'inside.jpg', sideA: 'side-a.jpg', sideB: 'side-b.jpg' }
  // front/back/inside: portrait J-card panels (~65×102 mm, e.g. 640×1004 px) — turned onto the case automatically.
  // spine: 102×14.5 mm strip (e.g. 1024×146 px), text running left→right.  sideA/sideB: shell labels, same template as the featured sticker.
  // Missing files fall back to plain typographic stand-ins. See assets/collection/README.md.
  collection: {
    dir: 'assets/collection',
    featuredSlot: 7, plainColor: '#0b0a09', // spine / back / inside / shell labels when no file is given // position of the featured cassette among the 20 cabinet slots
    albums: [
    { id: 'rammstein-mutter', artist: "Rammstein", album: "Mutter", year: 2001, files: { front: 'front.jpg' } },
    { id: 'rammstein-sehnsucht', artist: "Rammstein", album: "Sehnsucht", year: 1997, files: { front: 'front.jpg' } },
    { id: 'ministry-psalm-69', artist: "Ministry", album: "Psalm 69", year: 1992, files: { front: 'front.jpg' } },
    { id: 'ministry-the-mind-is-a-terrible-thing-to-taste', artist: "Ministry", album: "The Mind Is a Terrible Thing to Taste", year: 1989, files: { front: 'front.jpg' } },
    { id: 'kmfdm-nihil', artist: "KMFDM", album: "Nihil", year: 1995, files: { front: 'front.jpg' } },
    { id: 'kmfdm-symbols', artist: "KMFDM", album: "Symbols", year: 1997, files: { front: 'front.jpg' } },
    { id: 'nine-inch-nails-pretty-hate-machine', artist: "Nine Inch Nails", album: "Pretty Hate Machine", year: 1989, files: { front: 'front.png' } },
    { id: 'nine-inch-nails-the-fragile', artist: "Nine Inch Nails", album: "The Fragile", year: 1999, files: { front: 'front.jpg' } },
    { id: 'rob-zombie-hellbilly-deluxe', artist: "Rob Zombie", album: "Hellbilly Deluxe", year: 1998, files: { front: 'front.jpg' } },
    { id: 'the-matrix-ost', artist: "Various Artists", album: "The Matrix: Music from and Inspired by the Motion Picture", year: 1999, files: { front: 'front.png' } },
    { id: 'marilyn-manson-antichrist-superstar', artist: "Marilyn Manson", album: "Antichrist Superstar", year: 1996, files: { front: 'front.png' } },
    { id: 'marilyn-manson-holy-wood', artist: "Marilyn Manson", album: "Holy Wood (In the Shadow of the Valley of Death)", year: 2000, files: { front: 'front.png' } },
    { id: 'mortal-kombat-ost', artist: "Various Artists", album: "Mortal Kombat: Original Motion Picture Soundtrack", year: 1995, files: { front: 'front.jpg' } },
    { id: 'skinny-puppy-too-dark-park', artist: "Skinny Puppy", album: "Too Dark Park", year: 1990, files: { front: 'front.jpg' } },
    { id: 'skinny-puppy-last-rights', artist: "Skinny Puppy", album: "Last Rights", year: 1992, files: { front: 'front.jpg' } },
    { id: 'front-242-front-by-front', artist: "Front 242", album: "Front by Front", year: 1988, files: { front: 'front.jpg' } },
    { id: 'front-line-assembly-tactical-neural-implant', artist: "Front Line Assembly", album: "Tactical Neural Implant", year: 1992, files: { front: 'front.jpg' } },
    { id: 'nitzer-ebb-that-total-age', artist: "Nitzer Ebb", album: "That Total Age", year: 1987, files: { front: 'front.jpg' } },
    { id: 'wumpscut-embryodead', artist: ":Wumpscut:", album: "Embryodead", year: 1997, files: { front: 'front.jpg' } },
    ],
  },
  // Optional sampled sounds; null → synthesized in the browser.
  sounds: {
    caseOpen: null, caseClose: null, cassetteOut: null, cassetteIn: null, cassetteDown: null,
    pencilPick: null, pencilDown: null, pencilTap: null, pencilOut: null, windTick: null, strain: null,
    playerOpen: null, playerClose: null, cassetteInsert: null, keyDown: null, keyUp: null,
    cabinetOpen: null, cabinetClose: null, casePick: null, casePlace: null, heavyPick: null, heavyPlace: null,
  },
  tape: {
    speed: 0.0476,         // m/s — standard compact cassette speed (4.76 cm/s)
    hubRadius: 0.0110,     // m — empty hub
    fullPackRadius: 0.0240,// m — full pack (visual)
    rewindScale: 1,        // 1 = physical: tape moved = pack radius × hub angle
    maxTurnsPerSecond: 2.6,// hand limit on the pencil
    startAtEnd: true,      // cassette starts fully played (tape on the right reel)
  },
  debug: false, // or add ?debug to the URL — shows tape position
};
