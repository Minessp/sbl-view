import type { Strings } from './pt-BR';

/** Interface text, English. Same type as PT-BR: plain, technical, no promises. */
export const en: Strings = {
  meta: {
    name: 'SBL View',
    tagline: 'A biomechanics atlas for people who train',
  },
  nav: {
    label: 'Main navigation',
    home: 'Home',
    atlas: 'Atlas',
    library: 'Exercises',
    lab: 'Lab',
    training: 'Training',
    skip: 'Skip to content',
    search: 'Search the site (Ctrl+K)',
    menu: 'Menu',
    menuOpen: 'Open the menu',
  },
  page: {
    notFound: 'Page not found',
    notFoundLead: 'This address does not lead to any SBL View page. The link may be broken or the page may have moved.',
    notFoundHome: 'Back to home',
    error: 'The page did not load',
    errorLead: 'You may be offline, or a new version of the site was published while this tab was open. Reloading usually fixes it; your logs stay on the device.',
    reload: 'Reload',
  },
  pwa: {
    update: 'A new version of SBL View is ready.',
    reload: 'Update',
    dismiss: 'Later',
  },
  theme: {
    label: 'Light theme',
  },
  home: {
    title: 'Watch the muscle work',
    lead: 'A 3D anatomical body for understanding training: where each muscle attaches, when it lengthens or shortens in each exercise, how much torque the squat asks for and how to plan the week. Every number carries its source and confidence level.',
    hintFine: 'Move the cursor over the body: the lens removes the skin. Click a muscle to open it in the Atlas. Drag to rotate.',
    hintCoarse: 'Tap the body: the lens removes the skin. Tap the same muscle again to open it in the Atlas. Drag to rotate.',
    viewer: 'Interactive anatomical body',
    keys: 'Arrow keys rotate the body. Enter opens in the Atlas whatever is at the center of the lens. 1, 2 and 3 set the lens depth.',
    lens: { label: 'Lens depth', superficial: 'Muscle', deep: 'Deep', bone: 'Bone' },
    open: (name: string) => `${name}: open in the Atlas`,
    entries: 'Where to start',
    doors: {
      atlas: { name: 'Atlas', body: 'Every muscle, layer by layer: origin, insertion and action' },
      library: { name: 'Exercises', body: 'Animated, with each target’s length through the rep' },
      lab: { name: 'Lab', body: 'Length, load and torque, exercise against exercise' },
      training: { name: 'Training', body: 'Split, live session, records and analysis' },
    },
    cue: 'Scroll to open the layers',
    explode: {
      title: 'Four layers, one body',
      body: 'Skin, superficial muscle, deep muscle and bone, side by side. In the Atlas each layer turns on, off or into a ghost, and any structure can be isolated.',
    },
    layers: { skin: 'Skin', superficial: 'Superficial muscle', deep: 'Deep muscle', bone: 'Bone' },
    loading: 'Building the body',
  },
  stage: {
    failed: 'Could not download the anatomical body. Check your connection and try again.',
    retry: 'Try again',
  },
  lang: {
    other: 'Português',
    otherLabel: 'Ver esta página em português',
  },
};

export default en;
