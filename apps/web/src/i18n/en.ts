/**
 * Reference message catalog (English, design.md D1). Its shape defines the
 * `Messages` type; every other catalog must provide exactly the same keys.
 *
 * Conventions:
 * - Keys are grouped by UI area (e.g. `common.ok`, later `menu.file.saveMovie`).
 * - `{name}` marks a placeholder filled from the `params` of `t()`.
 * - A plural message is an object `{ one, other }`; `t()` picks the variant via
 *   `Intl.PluralRules` from the required `count` param. Plain objects with
 *   exactly the keys `one` and `other` are reserved for plural messages.
 */
export const en = {
  app: {
    name: "moviemakerY2K",
  },
  language: {
    de: "Deutsch",
    en: "English",
  },
  options: {
    title: "Options",
    language: "Language of the user interface:",
  },
  shell: {
    windowTitle: "{app} – Untitled Project",
    taskPane: "Movie Tasks",
    toolbar: "Toolbar",
    collections: "Collections:",
    collection: "Collection: {name}",
    collectionPrefix: "Collection:",
    preview: "Preview",
    storyboard: "Storyboard",
    showTimeline: "Show Timeline",
    storyboardHint: "Drag pictures here to create a slide show.",
  },
  collections: {
    media: "My Pictures",
    transitions: "Video Transitions",
  },
  menu: {
    bar: "Menu bar",
    file: {
      label: "File",
      newProject: "New Project",
      openProject: "Open Project…",
      saveProject: "Save Project",
      import: "Import into Collections…",
      saveMovie: "Save Movie…",
      exit: "Exit",
    },
    edit: {
      label: "Edit",
      undo: "Undo",
      redo: "Redo",
      cut: "Cut",
      copy: "Copy",
      paste: "Paste",
      delete: "Delete",
      selectAll: "Select All",
    },
    view: {
      label: "View",
      timeline: "Timeline",
      fullScreen: "Full Screen",
    },
    tools: {
      label: "Tools",
      transitions: "Video Transitions",
      effects: "Video Effects",
      autoMovie: "AutoMovie…",
      options: "Options…",
    },
    clip: {
      label: "Clip",
      addToStoryboard: "Add to Storyboard",
      split: "Split",
    },
    play: {
      label: "Play",
      playPause: "Play/Pause",
      stop: "Stop",
    },
    help: {
      label: "Help",
      about: "About",
    },
    keys: {
      delete: "Del",
      space: "Space",
    },
  },
  tasks: {
    capture: {
      title: "1. Capture Video",
      importVideo: "Import video",
      importPictures: "Import pictures",
      importAudio: "Import audio or music",
    },
    edit: {
      title: "2. Edit Movie",
      showCollections: "View collections",
      showEffects: "View video effects",
      showTransitions: "View video transitions",
      makeTitles: "Make titles or credits",
    },
    finish: {
      title: "3. Finish Movie",
      saveToComputer: "Save to my computer",
      publishWeb: "Publish to the web",
    },
  },
  status: {
    connecting: "Connecting to backend…",
    offline: "Backend not reachable",
    ready: "Backend ready · FFmpeg {version}",
    readyNoFfmpeg: "Backend ready · FFmpeg missing",
    saving: "Saving…",
    saved: "Saved",
    saveFailed: "Saving failed",
  },
  about: {
    title: "About {app}",
    version: "Version {version}",
    text: "{app} is inspired by the classic Movie Maker. It is not a Microsoft product and is not affiliated with Microsoft.",
    license: "License: {license}",
  },
  newProject: {
    title: "New Project",
    message:
      "Do you want to start a new project? The storyboard will be cleared; the pictures in the collection are kept.",
  },
  media: {
    emptyHint: "This collection is empty. Choose “Import pictures” or drag pictures here.",
    list: "Pictures",
    draggable: "draggable picture",
    menu: "Picture “{name}”",
    addToStoryboard: "Add to Storyboard",
    delete: "Delete",
    deleteTitle: "Delete Picture",
    deleteQuestion:
      "Are you sure you want to delete “{name}”? It will also be removed from the storyboard.",
    deleteFailed: "“{name}” could not be deleted.",
  },
  upload: {
    progress: "Importing {current} of {total} …",
    progressLabel: "Import progress",
    failed: {
      one: "{count} file was not imported:",
      other: "{count} files were not imported:",
    },
    unknownError: "Error",
    offline: "Backend not reachable.",
  },
  storyboard: {
    list: "Storyboard strip",
    sortable: "sortable tile",
    missingImage: "missing picture",
    slide: "Picture {number}: {name}, {duration}",
    slideMenu: "Picture {number} of the storyboard",
    effectSlot: "Effect slot for picture {number}",
    effectsLater: "Video effects will follow later",
    transitionBefore: "Transition before picture {number}",
    noTransition: "none (hard cut)",
    remove: "Remove",
    properties: "Properties…",
    removeTransition: "Remove Transition",
    slideProperties: "Properties of Picture {number}",
    slideDuration: "Picture duration (seconds):",
    transitionDuration: "Transition duration (seconds):",
    transition: "Transition:",
  },
  dnd: {
    element: "Element",
    transition: "Transition “{name}”",
    picture: "Picture “{name}”",
    pickedUp: "{item} picked up. Arrow keys move, Enter or Space drops, Escape cancels.",
    overSlot: "Over the transition slot before picture {number}.",
    overStoryboard: "Over the storyboard.",
    outside: "Outside the storyboard.",
    dropped: "{item} dropped.",
    noTarget: "Drop cancelled: no target.",
    cancelled: "Dragging cancelled.",
    instructions:
      "Enter picks up the element. Move it with the arrow keys (from the collection: arrow down into the storyboard), Enter or Space drops, Escape cancels.",
  },
  transitions: {
    unavailable: "The transition catalog is not available.",
    list: "Transitions",
    draggable: "draggable transition",
  },
  player: {
    seek: "Seek bar",
    play: "Play",
    pause: "Pause",
    stop: "Stop",
    previous: "Previous picture",
    next: "Next picture",
    time: "Time",
    canvas: "Preview picture",
    webgl2Missing: "The preview requires WebGL2. Import and storyboard keep working.",
  },
  duration: {
    range: "Allowed are {min} to {max} seconds in steps of {step}.",
  },
  common: {
    ok: "OK",
    cancel: "Cancel",
    close: "Close",
    yes: "Yes",
    no: "No",
    back: "< Back",
    next: "Next >",
  },
  units: {
    seconds: "{value} s",
    kilobytes: "approx. {value} KB",
    megabytes: "approx. {value} MB",
    secondsCount: { one: "{count} second", other: "{count} seconds" },
    minutesCount: { one: "{count} minute", other: "{count} minutes" },
  },
};
