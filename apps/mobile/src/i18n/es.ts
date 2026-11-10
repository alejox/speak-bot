import type { Messages } from "./en";

/** Spanish copy (default language): neutral and professional, using "tú". */
export const es: Messages = {
  "app.title": "Speak Bot",
  "app.speechUnsupported": "Este navegador no permite la síntesis de voz. Prueba con Chrome o Safari.",

  "nav.label": "Secciones",
  "nav.speak": "Hablar",
  "nav.phrases": "Frases",
  "nav.connect": "Conectar",
  "nav.settings": "Ajustes",

  "speak.quickPhrases": "Frases rápidas",

  "composer.region": "Escribe para hablar",
  "composer.textLabel": "Texto para decir",
  "composer.placeholder": "Escribe lo que quieres decir…",
  "composer.speak": "Hablar",
  "composer.stop": "Detener",
  "composer.save": "Guardar como frase",

  "phrases.title": "Frases guardadas",
  "phrases.edit": "Editar",
  "phrases.done": "Listo",
  "phrases.empty": "Aún no tienes frases guardadas.",
  "phrases.emptyEditable": "Aún no tienes frases guardadas. Pulsa «Editar» para agregar una o restaurar las predeterminadas.",
  "phrases.speakLabel": "Decir: {text}",
  "phrases.deleteLabel": "Eliminar frase: {text}",
  "phrases.addLabel": "Nueva frase",
  "phrases.addPlaceholder": "Escribe una nueva frase…",
  "phrases.add": "Agregar",
  "phrases.restore": "Restaurar frases predeterminadas",
  "phrases.restoreConfirm": "¿Seguro? Se borrarán tus frases actuales y se reemplazarán por las predeterminadas.",
  "phrases.restoreYes": "Sí, restaurar",
  "phrases.restoreCancel": "Cancelar",

  "status.typeToSave": "Escribe algo para guardarlo como frase.",
  "status.duplicate": "Esa frase ya está guardada.",
  "status.saved": "Frase guardada.",
  "status.deleted": "Se eliminó «{text}».",
  "status.loadFailed": "No se pudieron cargar las frases.",
  "status.saveFailed": "No se pudo guardar la frase.",
  "status.deleteFailed": "No se pudo eliminar la frase.",
  "status.restored": "Se restauraron las frases predeterminadas.",
  "status.restoreFailed": "No se pudieron restaurar las frases predeterminadas.",

  "error.emptyText": "Escribe algo antes de hablar.",
  "error.speechUnsupported": "Este dispositivo o navegador no permite la síntesis de voz.",
  "error.engineUnavailable": "La computadora no puede hablar porque falta su motor de voz. {detail}",
  "error.desktopSpeechFailed": "La computadora no pudo decir eso. Inténtalo de nuevo.",
  "error.desktopRequestFailed": "La computadora no aceptó la solicitud. Inténtalo de nuevo.",
  "error.speechFailed": "No se pudo decir eso. Inténtalo de nuevo.",
  "error.loadDesktopSettings": "No se pudo cargar la configuración de la computadora.",
  "error.saveDesktopSettings": "No se pudo guardar la configuración de la computadora.",

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
  "connect.dockHint": "Panel de control para OBS (Docks → Docks de navegador personalizados):",
  "connect.copyDockUrl": "Copiar URL del dock",
  "connect.copied": "¡Copiado!",
  "connect.copyFailed": "No se pudo copiar. Selecciona la URL y cópiala manualmente.",

  "dock.checking": "Conectando con la computadora…",
  "dock.noDesktop":
    "No se encontró la app de Speak Bot en la computadora. Abre este dock con la URL que aparece en la app (sección Conectar) mientras la app está abierta.",
};
