/** English copy. Every key here must exist in every other dictionary (enforced by `Messages`). */
export const en = {
  "app.title": "Speak Bot",
  "app.speechUnsupported": "Speech is not supported in this browser. Try Chrome or Safari.",

  "nav.label": "Sections",
  "nav.speak": "Speak",
  "nav.phrases": "Phrases",
  "nav.connect": "Connect",
  "nav.settings": "Settings",

  "speak.quickPhrases": "Quick phrases",

  "composer.region": "Type to speak",
  "composer.textLabel": "Text to speak",
  "composer.placeholder": "Type what you want to say…",
  "composer.speak": "Speak",
  "composer.stop": "Stop",
  "composer.save": "Save as phrase",

  "phrases.title": "Saved phrases",
  "phrases.edit": "Edit",
  "phrases.done": "Done",
  "phrases.empty": "No saved phrases yet.",
  "phrases.emptyEditable": "No saved phrases yet. Press “Edit” to add one or restore the default ones.",
  "phrases.speakLabel": "Speak: {text}",
  "phrases.deleteLabel": "Delete phrase: {text}",
  "phrases.addLabel": "New phrase",
  "phrases.addPlaceholder": "Type a new phrase…",
  "phrases.add": "Add",
  "phrases.restore": "Restore default phrases",
  "phrases.restoreConfirm": "Are you sure? Your current phrases will be deleted and replaced with the default ones.",
  "phrases.restoreYes": "Yes, restore",
  "phrases.restoreCancel": "Cancel",

  "status.typeToSave": "Type something to save it as a phrase.",
  "status.duplicate": "That phrase is already saved.",
  "status.saved": "Phrase saved.",
  "status.deleted": "Deleted “{text}”.",
  "status.loadFailed": "Could not load phrases.",
  "status.saveFailed": "Could not save the phrase.",
  "status.deleteFailed": "Could not delete the phrase.",
  "status.restored": "Default phrases restored.",
  "status.restoreFailed": "Could not restore the default phrases.",

  "error.emptyText": "Type something to speak first.",
  "error.speechUnsupported": "Speech is not supported on this device or browser.",
  "error.engineUnavailable": "The computer cannot speak because its speech engine is missing. {detail}",
  "error.desktopSpeechFailed": "The computer could not speak that. Please try again.",
  "error.desktopRequestFailed": "The computer did not accept the request. Please try again.",
  "error.speechFailed": "Could not speak that. Please try again.",
  "error.loadDesktopSettings": "Could not load the computer settings.",
  "error.saveDesktopSettings": "Could not save the computer settings.",

  "settings.language": "Language / Idioma",
  "settings.speakOn": "Speak on",
  "settings.speakOnDevice": "This device",
  "settings.speakOnComputer": "Computer",
  "settings.outputDevice": "Output device",
  "settings.systemDefault": "System default",
  "settings.voice": "Voice",
  "settings.voiceAuto": "Automatic (matches the language)",
  "settings.speed": "Speed",

  "connect.title": "Connect your phone",
  "connect.noNetwork": "No network found. Connect this computer to the same Wi-Fi as your phone.",
  "connect.qrAlt": "QR code for {url}",
  "connect.scanHint": "Scan the code with your phone's camera, or open this address on a phone on the same Wi-Fi:",
  "connect.networkAddress": "Network address",
  "connect.obsHint": "Captions for OBS (add a Browser Source):",
  "connect.copyObsUrl": "Copy OBS URL",
  "connect.dockHint": "Control panel for OBS (Docks → Custom Browser Docks):",
  "connect.copyDockUrl": "Copy dock URL",
  "connect.copied": "Copied!",
  "connect.copyFailed": "Could not copy. Select the URL and copy it by hand.",

  "dock.checking": "Connecting to the computer…",
  "dock.noDesktop":
    "The Speak Bot computer app was not found. Open this dock with the URL shown in the app (Connect section) while the app is running.",
} as const;

export type MessageKey = keyof typeof en;
export type Messages = Record<MessageKey, string>;
