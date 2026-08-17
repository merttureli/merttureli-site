window.SITE = {
  nav: [
    { id: "index", label: "Index" },
    { id: "work", label: "Work" },
    { id: "about", label: "About" },
    { id: "contact", label: "Contact" },
  ],
  hero: [
    { id: 1, line1: "Built", line2: "and flown", lead: "Aerospace engineering, a pilot's logbook, and a camera. One portfolio, three ways of looking at the same thing.", plate: "linear-gradient(150deg, #1a1c1f 0%, #4a4f56 46%, #b9bcc0 100%)", meta: "Ísafjörður / 66°04′ N" },
    { id: 2, line1: "Ten", line2: "thousand feet", lead: "Cross-country VFR, mostly at first light, mostly with the window open.", plate: "linear-gradient(160deg, #0f1114 0%, #3b4149 40%, #9aa1a8 100%)", meta: "EGKB → EGHI / 2025" },
    { id: 3, line1: "Frames", line2: "per second", lead: "Film when there is time, digital when there is not.", plate: "linear-gradient(130deg, #16181b 0%, #565b62 55%, #cfd2d5 100%)", meta: "Portra 400 / FM2" },
  ],
  work: [
    { id: "w1", index: "01", title: "Wing rib topology", discipline: "Engineering", year: "2025", ratio: "4 / 5", plate: "linear-gradient(140deg,#2b2e33,#c6c9cc)" },
    { id: "w2", index: "02", title: "First light, EGKB", discipline: "Aviation", year: "2025", ratio: "4 / 5", plate: "linear-gradient(140deg,#1d2024,#a9aeb3)" },
    { id: "w3", index: "03", title: "Coastline series", discipline: "Photography", year: "2024", ratio: "4 / 5", plate: "linear-gradient(140deg,#343840,#d2d5d8)" },
    { id: "w4", index: "04", title: "Composite lay-up rig", discipline: "Engineering", year: "2024", ratio: "4 / 5", plate: "linear-gradient(140deg,#22252a,#b0b4b8)" },
    { id: "w5", index: "05", title: "Night circuits", discipline: "Aviation", year: "2024", ratio: "4 / 5", plate: "linear-gradient(140deg,#101215,#8f959b)" },
    { id: "w6", index: "06", title: "Kitchen, 06:40", discipline: "Photography", year: "2023", ratio: "4 / 5", plate: "linear-gradient(140deg,#3a3e45,#dcdfe1)" },
  ],
  project: {
    index: "01", title: "Wing rib topology", discipline: "Engineering", year: "2025",
    lead: "A structural study of a light-aircraft wing rib, reduced by topology optimisation until only the load paths remained. The result is 31% lighter than the machined baseline and takes the same limit load.",
    body: [
      "The brief was narrow: keep the spar interface and the skin attachment untouched, and remove everything else that is not carrying load. That constraint makes the problem readable — the optimiser is not designing the part, it is showing you where the forces already go.",
      "Six iterations, each one printed at quarter scale before committing to the aluminium. The photographs below are of the fifth, which failed in the way the model said it would, at the load the model said it would.",
    ],
    specs: [
      { label: "Discipline", value: "Structural / FEA", aside: "2025" },
      { label: "Method", value: "Topology optimisation", aside: "Altair" },
      { label: "Material", value: "AL 7075-T6", aside: "2.81 g/cm³" },
      { label: "Mass", value: "−31%", aside: "vs baseline" },
      { label: "Limit load", value: "3.8 g", aside: "1.5 factor" },
    ],
  },
  about: {
    lead: "I am an engineer, a pilot and a photographer, in the order I picked them up.",
    body: [
      "The engineering pays for the flying and the flying finds the pictures. In practice the three are one habit: get close to the thing, understand how it holds together, then decide what is worth keeping in frame.",
      "Based in London. Available for structural and mechanical design work, and for commissions in aviation, landscape and food photography. I travel often, and most of what ends up here was made somewhere other than home.",
    ],
    specs: [
      { label: "Engineering", value: "MEng Aerospace", aside: "Structures / FEA" },
      { label: "Licence", value: "PPL(A) SEP", aside: "Night rating" },
      { label: "Hours", value: "412", aside: "PIC 260" },
      { label: "Bodies", value: "Nikon FM2 · Fuji X-T5", aside: "35 / 50 / 85" },
      { label: "Based", value: "London, UK", aside: "Will travel" },
    ],
  },
};
