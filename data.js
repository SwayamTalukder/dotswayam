/*
  .swayam — the map's data.

  The map is radial: self.swayam sits at the centre, time runs outward,
  and every region is a zone (a slice of the circle). Everything on the
  map is drawn from this file. To add something you remember later, add
  a thread to its region with its years; the map lays itself out again.

  Years can be decimals: 2019.5 is mid-2019. The exact years are still
  estimates; the order is what matters most.

  Each thread has phases. A phase lasts until `to` (null = still going).
    glow    — active (now, or at the time)
    blink   — still alive, but on and off
    flicker — thin and uncertain (the Believe stretch)
  If the last phase has an end year, the thread is "saved": it dims once
  the journey passes it, but its file stays. Threads still going when the
  map reaches today run on to the edge and end in next.swayam.

  Regions go clockwise from the top. Threads are placed across their zone
  in the order listed. `from: 'id'` branches a thread off another thread
  instead of off the zone's main road.
*/
window.SWAYAM = {
  start: 2003,
  now: 2026.83,

  regions: [
    { id: 'mind',   label: 'mind/' },
    { id: 'rhythm', label: 'rhythm/' },
    { id: 'play',   label: 'play/' },
    { id: 'wild',   label: 'wild/' },
    { id: 'roads',  label: 'roads/' },
    { id: 'frames', label: 'frames/' },
    { id: 'build',  label: 'build/' },
  ],

  threads: [
    // mind/
    { id: 'storybooks', file: 'storybooks.swayam', region: 'mind', start: 2004.5,
      phases: [{ state: 'glow', to: 2013 }], note: 'Reading and storybooks. The first thread of all.' },
    { id: 'self-help', file: 'self-help.swayam', region: 'mind', start: 2008,
      phases: [{ state: 'glow', to: null }] },
    { id: 'knowledge', file: 'knowledge.swayam', region: 'mind', start: 2011,
      phases: [{ state: 'glow', to: null }], note: 'Learning how things work.' },
    { id: 'politics', file: 'politics.swayam', region: 'mind', start: 2024.6,
      phases: [{ state: 'glow', to: null }], note: 'Reading about it, following it.' },

    // rhythm/
    { id: 'dancing', file: 'dancing.swayam', region: 'rhythm', start: 2005.2,
      phases: [{ state: 'glow', to: 2008.5 }] },
    { id: 'singing', file: 'singing.swayam', region: 'rhythm', start: 2006,
      phases: [{ state: 'glow', to: 2019.5 }, { state: 'blink', to: null }] },

    // play/
    { id: 'cricket', file: 'cricket.swayam', region: 'play', start: 2007,
      phases: [{ state: 'glow', to: 2019.5 }, { state: 'blink', to: null }] },
    { id: 'shooting', file: 'shooting.swayam', region: 'play', start: 2024.3,
      phases: [{ state: 'glow', to: 2024.9 }], note: 'Tried it.' },

    // wild/
    { id: 'swimming', file: 'swimming.swayam', region: 'wild', start: 2010,
      phases: [{ state: 'glow', to: 2013 }] },
    { id: 'nature', file: 'nature.swayam', region: 'wild', start: 2012,
      phases: [{ state: 'glow', to: null }], note: 'Mountains, rivers, animals.' },
    { id: 'hiking', file: 'hiking.swayam', region: 'wild', start: 2023.5,
      phases: [{ state: 'glow', to: null }] },
    { id: 'biking', file: 'biking.swayam', region: 'wild', start: 2023.8,
      phases: [{ state: 'glow', to: null }] },
    { id: 'adventure', file: 'adventure.swayam', region: 'wild', start: 2024.2,
      phases: [{ state: 'glow', to: null }], note: 'Shark diving and the rest.' },

    // roads/
    { id: 'people', file: 'people-cultures.swayam', region: 'roads', start: 2023.6,
      phases: [{ state: 'glow', to: null }], note: 'People and cultures.' },
    { id: 'countries', file: 'countries.swayam', region: 'roads', start: 2025,
      phases: [{ state: 'glow', to: null }], note: 'States and countries.' },
    { id: 'solo-travel', file: 'solo-travel.swayam', region: 'roads', start: 2025.4,
      phases: [{ state: 'glow', to: null }] },

    // frames/
    { id: 'drawing', file: 'drawing.swayam', region: 'frames', start: 2006,
      phases: [{ state: 'glow', to: 2011.5 }] },
    { id: 'photography', file: 'photography.swayam', region: 'frames', start: 2023.3,
      phases: [{ state: 'glow', to: null }] },
    { id: 'videography', file: 'videography.swayam', region: 'frames', start: 2023.7,
      phases: [{ state: 'glow', to: null }] },

    // build/
    { id: 'cybersecurity', file: 'cybersecurity.swayam', region: 'build', start: 2014,
      phases: [{ state: 'glow', to: 2018 }, { state: 'blink', to: null }],
      note: 'White-hat enthusiast. Back to glowing after CEH.' },
    { id: 'venture-01', file: 'venture-01.swayam', region: 'build', start: 2020.9,
      phases: [{ state: 'glow', to: 2021.6 }], note: 'Started. Stopped. Saved.' },
    { id: 'venture-02', file: 'venture-02.swayam', region: 'build', start: 2021.7,
      phases: [{ state: 'glow', to: 2022.3 }], note: 'Started. Stopped. Saved.' },
    { id: 'venture-03', file: 'venture-03.swayam', region: 'build', start: 2022.4,
      phases: [{ state: 'glow', to: 2023 }], note: 'Started. Stopped. Saved.' },
    { id: 'engineering', file: 'engineering.swayam', region: 'build', start: 2015.6,
      phases: [{ state: 'flicker', to: 2020.1 }], note: 'Not sure it would grow into anything. Kept going.' },
    { id: 'cloud', file: 'cloud.swayam', region: 'build', start: 2020.1, from: 'engineering',
      phases: [{ state: 'glow', to: null }], note: 'Cloud and DevOps, across four countries.' },
    { id: 'teams', file: 'leading-teams.swayam', region: 'build', start: 2022.8, from: 'cloud',
      phases: [{ state: 'glow', to: null }] },
    { id: 'freelance', file: 'freelance-web.swayam', region: 'build', start: 2023.6,
      phases: [{ state: 'glow', to: null }], note: 'Websites for real clients.' },
  ],

  // S W A Y A M, in reading order.
  letters: [
    { ch: 'S', word: 'Self',    line: 'Self is the first project.' },
    { ch: 'W', word: 'Wander',  line: 'Every path leaves you bigger.' },
    { ch: 'A', word: 'Believe', line: 'Stand in it, don’t shrink from it.' },
    { ch: 'Y', word: 'Yes',     line: 'Say yes to the unknown.' },
    { ch: 'A', word: 'Attempt', line: 'Falling is just another saved file.' },
    { ch: 'M', word: 'Meaning', line: 'Purpose is found on the road, not before it.' },
  ],

  // The journey, in the order it actually happened. `letter` points into
  // `letters`, so the word fills in out of order. `weight` = share of the scroll.
  beats: [
    { letter: 0, from: 2003, to: 2003.6, weight: 0.06,
      caption: 'A single dot at the centre of a blank map. self.swayam is created at 0 KB.' },
    { letter: 1, from: 2003.6, to: 2014, weight: 0.21,
      caption: 'Storybooks first. Then dancing, then singing and drawing together, then cricket. None of it planned.' },
    { letter: 2, from: 2014, to: 2020.3, weight: 0.18,
      caption: 'Engineering. No promise it would grow into anything. The line ran thin and kept going, until the job landed and cloud lit up.' },
    { letter: 4, from: 2020.3, to: 2023.2, weight: 0.13,
      caption: 'Three businesses. Each one sparked, then stopped. All three are still saved, and the self file grew with every one.' },
    { letter: 3, from: 2023.2, to: 2026.83, weight: 0.2,
      caption: 'A camera, mountains, the ocean, politics, new countries, and finally solo roads. The map spreads out in every direction.' },
    { letter: 5, from: 2026.83, to: 2026.83, weight: 0.14,
      caption: 'Every live branch runs to the edge of what is known and stops there. Past the outline, nothing is mapped yet.' },
  ],
};
