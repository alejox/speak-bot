import type { Messages } from "./en";

/** Spanish copy (default language): neutral and professional, using "tú". */
export const es: Messages = {
  "app.title": "Speak Bot",
  "app.speechUnsupported": "Este navegador no permite la síntesis de voz. Prueba con Chrome o Safari.",

  "composer.region": "Escribe para hablar",
  "composer.textLabel": "Texto para decir",
  "composer.placeholder": "Escribe lo que quieres decir…",
  "composer.speak": "Hablar",
  "composer.stop": "Detener",
  "composer.save": "Guardar como frase",

  "phrases.title": "Frases guardadas",
  "phrases.edit": "Editar",
  "phrases.done": "Listo",
  "phrases.empty": "Aún no tienes frases guardadas. Escribe algo y pulsa «Guardar como frase».",
  "phrases.speakLabel": "Decir: {text}",
  "phrases.deleteLabel": "Eliminar frase: {text}",

  "status.typeToSave": "Escribe algo para guardarlo como frase.",
  "status.duplicate": "Esa frase ya está guardada.",
  "status.saved": "Frase guardada.",
  "status.deleted": "Se eliminó «{text}».",
  "status.loadFailed": "No se pudieron cargar las frases.",
  "status.saveFailed": "No se pudo guardar la frase.",
  "status.deleteFailed": "No se pudo eliminar la frase.",

  "error.emptyText": "Escribe algo antes de hablar.",
  "error.speechUnsupported": "Este dispositivo o navegador no permite la síntesis de voz.",
  "error.engineUnavailable": "La computadora no puede hablar porque falta su motor de voz. {detail}",
  "error.desktopSpeechFailed": "La computadora no pudo decir eso. Inténtalo de nuevo.",
  "error.desktopRequestFailed": "La computadora no aceptó la solicitud. Inténtalo de nuevo.",
  "error.speechFailed": "No se pudo decir eso. Inténtalo de nuevo.",
  "error.loadDesktopSettings": "No se pudo cargar la configuración de la computadora.",
  "error.saveDesktopSettings": "No se pudo guardar la configuración de la computadora.",

  "settings.title": "Ajustes de voz",
  "settings.language": "Idioma / Language",
  "settings.speakOn": "Hablar en",
  "settings.speakOnDevice": "Este dispositivo",
  "settings.speakOnComputer": "Computadora",
  "settings.outputDevice": "Dispositivo de salida",
  "settings.systemDefault": "Predeterminado del sistema",
  "settings.voice": "Voz",
  "settings.voiceAuto": "Automática (según el idioma)",
  "settings.speed": "Velocidad",

  "connect.title": "Conecta tu teléfono",
  "connect.noNetwork": "No se encontró ninguna red. Conecta esta computadora a la misma red Wi-Fi que tu teléfono.",
  "connect.qrAlt": "Código QR de {url}",
  "connect.scanHint":
    "Escanea el código con la cámara de tu teléfono o abre esta dirección en un teléfono conectado a la misma red Wi-Fi:",
  "connect.networkAddress": "Dirección de red",
  "connect.obsHint": "Subtítulos para OBS (agrega una fuente de navegador):",
  "connect.copyObsUrl": "Copiar URL de OBS",
  "connect.copied": "¡Copiado!",
  "connect.copyFailed": "No se pudo copiar. Selecciona la URL y cópiala manualmente.",
};
