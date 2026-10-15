// -----------------------------------------------------------------------------
// Texts produced by the container, in the four languages of the Gladys
// interface. German says "du", Spanish "usted" (test/i18n.test.js).
//
// A device integration does not receive the user's language: the feature
// names and the text states follow the `language` setting of the
// configuration (French by default). The widget receives the language of
// whoever looks at it.
// -----------------------------------------------------------------------------

export const FALLBACK_LANGUAGE = 'en';

// Labels of the apcupsd status words (see STATUS_WORDS in src/ups.js).
export const STATUS_LABELS = {
  COMMLOST: {
    en: 'UPS not responding',
    fr: 'Onduleur muet',
    de: 'USV antwortet nicht',
    es: 'El SAI no responde',
  },
  SHUTTINGDOWN: {
    en: 'Shutting down',
    fr: 'Arrêt en cours',
    de: 'Wird heruntergefahren',
    es: 'Apagándose',
  },
  ONBATT: { en: 'On battery', fr: 'Sur batterie', de: 'Batteriebetrieb', es: 'Con batería' },
  ONLINE: { en: 'On mains', fr: 'Sur secteur', de: 'Netzbetrieb', es: 'Con red eléctrica' },
  OVERLOAD: { en: 'Overload', fr: 'Surcharge', de: 'Überlast', es: 'Sobrecarga' },
  LOWBATT: { en: 'Low battery', fr: 'Batterie faible', de: 'Batterie schwach', es: 'Batería baja' },
  REPLACEBATT: {
    en: 'Replace battery',
    fr: 'Batterie à remplacer',
    de: 'Batterie ersetzen',
    es: 'Sustituir la batería',
  },
  NOBATT: { en: 'No battery', fr: 'Pas de batterie', de: 'Keine Batterie', es: 'Sin batería' },
  CAL: { en: 'Calibrating', fr: 'Calibrage', de: 'Kalibrierung', es: 'Calibrando' },
  TRIM: {
    en: 'Lowering voltage',
    fr: 'Abaisse la tension',
    de: 'Senkt die Spannung',
    es: 'Reduciendo la tensión',
  },
  BOOST: {
    en: 'Raising voltage',
    fr: 'Relève la tension',
    de: 'Hebt die Spannung an',
    es: 'Elevando la tensión',
  },
  SLAVEDOWN: {
    en: 'Master unreachable',
    fr: 'Maître injoignable',
    de: 'Master nicht erreichbar',
    es: 'Maestro inaccesible',
  },
  SLAVE: { en: 'Network client', fr: 'Client réseau', de: 'Netzwerk-Client', es: 'Cliente de red' },
};

// Reasons of the last transfer to battery: the fixed texts of apcupsd
// (lib/apcstatus.c). An unknown text is shown as apcupsd wrote it.
export const TRANSFER_REASONS = {
  'No transfers since turnon': {
    en: 'No transfer since start-up',
    fr: 'Aucun transfert depuis le démarrage',
    de: 'Keine Umschaltung seit dem Start',
    es: 'Ninguna transferencia desde el arranque',
  },
  'Automatic or explicit self test': {
    en: 'Self-test',
    fr: 'Autotest',
    de: 'Selbsttest',
    es: 'Autotest',
  },
  'Forced by software': {
    en: 'Forced by software',
    fr: 'Forcé par logiciel',
    de: 'Per Software erzwungen',
    es: 'Forzado por software',
  },
  'Low line voltage': {
    en: 'Low mains voltage',
    fr: 'Tension secteur trop basse',
    de: 'Netzspannung zu niedrig',
    es: 'Tensión de red demasiado baja',
  },
  'High line voltage': {
    en: 'High mains voltage',
    fr: 'Tension secteur trop haute',
    de: 'Netzspannung zu hoch',
    es: 'Tensión de red demasiado alta',
  },
  'Unacceptable line voltage changes': {
    en: 'Unstable mains voltage',
    fr: 'Tension secteur instable',
    de: 'Instabile Netzspannung',
    es: 'Tensión de red inestable',
  },
  'Line voltage notch or spike': {
    en: 'Voltage dip or spike',
    fr: 'Creux ou pic de tension',
    de: 'Spannungseinbruch oder -spitze',
    es: 'Caída o pico de tensión',
  },
  'Input frequency out of range': {
    en: 'Mains frequency out of range',
    fr: 'Fréquence secteur hors plage',
    de: 'Netzfrequenz außerhalb des Bereichs',
    es: 'Frecuencia de red fuera de rango',
  },
  'UNKNOWN EVENT': {
    en: 'Unknown event',
    fr: 'Événement inconnu',
    de: 'Unbekanntes Ereignis',
    es: 'Evento desconocido',
  },
};

// Feature names, by language then feature key (src/devices.js). Fixed when
// the device is added to Gladys.
export const NAMES = {
  en: {
    status: 'Status',
    mains: 'Mains power',
    lowBattery: 'Low battery',
    battery: 'Battery charge',
    runtime: 'Runtime',
    load: 'Load',
    power: 'Power',
    energy: 'Energy',
    inputVoltage: 'Input voltage',
    outputVoltage: 'Output voltage',
    batteryVoltage: 'Battery voltage',
    temperature: 'Internal temperature',
    batteryDate: 'Battery date',
    lastTransfer: 'Last transfer',
    lastTransferReason: 'Last transfer reason',
    transfers: 'Transfers',
    timeOnBattery: 'Time on battery',
    totalTimeOnBattery: 'Total time on battery',
    model: 'Model',
    serial: 'Serial number',
  },
  fr: {
    status: 'État',
    mains: 'Secteur',
    lowBattery: 'Batterie faible',
    battery: 'Charge batterie',
    runtime: 'Autonomie',
    load: 'Charge',
    power: 'Puissance',
    energy: 'Énergie',
    inputVoltage: "Tension d'entrée",
    outputVoltage: 'Tension de sortie',
    batteryVoltage: 'Tension batterie',
    temperature: 'Température interne',
    batteryDate: 'Date de la batterie',
    lastTransfer: 'Dernier transfert',
    lastTransferReason: 'Raison du dernier transfert',
    transfers: 'Nombre de transferts',
    timeOnBattery: 'Temps sur batterie',
    totalTimeOnBattery: 'Temps cumulé sur batterie',
    model: 'Modèle',
    serial: 'Numéro de série',
  },
  de: {
    status: 'Status',
    mains: 'Netzstrom',
    lowBattery: 'Batterie schwach',
    battery: 'Batterieladung',
    runtime: 'Restlaufzeit',
    load: 'Last',
    power: 'Leistung',
    energy: 'Energie',
    inputVoltage: 'Eingangsspannung',
    outputVoltage: 'Ausgangsspannung',
    batteryVoltage: 'Batteriespannung',
    temperature: 'Innentemperatur',
    batteryDate: 'Batteriedatum',
    lastTransfer: 'Letzte Umschaltung',
    lastTransferReason: 'Grund der letzten Umschaltung',
    transfers: 'Anzahl Umschaltungen',
    timeOnBattery: 'Zeit im Batteriebetrieb',
    totalTimeOnBattery: 'Gesamtzeit im Batteriebetrieb',
    model: 'Modell',
    serial: 'Seriennummer',
  },
  es: {
    status: 'Estado',
    mains: 'Red eléctrica',
    lowBattery: 'Batería baja',
    battery: 'Carga de la batería',
    runtime: 'Autonomía',
    load: 'Carga',
    power: 'Potencia',
    energy: 'Energía',
    inputVoltage: 'Tensión de entrada',
    outputVoltage: 'Tensión de salida',
    batteryVoltage: 'Tensión de la batería',
    temperature: 'Temperatura interna',
    batteryDate: 'Fecha de la batería',
    lastTransfer: 'Última transferencia',
    lastTransferReason: 'Motivo de la última transferencia',
    transfers: 'Número de transferencias',
    timeOnBattery: 'Tiempo con batería',
    totalTimeOnBattery: 'Tiempo total con batería',
    model: 'Modelo',
    serial: 'Número de serie',
  },
};

// Name of a device whose UPS reports neither a name nor a model.
export const DEFAULT_DEVICE_NAME = { en: 'UPS', fr: 'Onduleur', de: 'USV', es: 'SAI' };

/** Pick a language in a multi-language object, English as a fallback. */
export function pick(text, language) {
  return text[language] ?? text[FALLBACK_LANGUAGE];
}

/**
 * The status as a sentence: "On battery, Low battery". Unknown words are
 * kept as apcupsd wrote them.
 * @param {Set<string>} words
 * @param {string} language
 */
export function statusText(words, language) {
  const known = Object.keys(STATUS_LABELS)
    .filter((word) => words.has(word))
    .map((word) => pick(STATUS_LABELS[word], language));
  const unknown = [...words].filter((word) => !STATUS_LABELS[word]);
  return [...known, ...unknown].join(', ');
}

/**
 * @param {string | undefined} reason the LASTXFER text of apcupsd
 * @param {string} language
 */
export function transferReasonText(reason, language) {
  if (!reason) {
    return undefined;
  }
  const known = TRANSFER_REASONS[reason];
  return known ? pick(known, language) : reason;
}

// Shown in the Configuration screen (connection status) and under the
// "Check the servers" button.
export const MESSAGES = {
  notConfigured: {
    en: 'Enter the address of your apcupsd server.',
    fr: "Saisissez l'adresse de votre serveur apcupsd.",
    de: 'Gib die Adresse deines apcupsd-Servers ein.',
    es: 'Introduzca la dirección de su servidor apcupsd.',
  },
  initFailed: {
    en: 'Initialization failed, check the integration logs.',
    fr: "L'initialisation a échoué, consultez les journaux de l'intégration.",
    de: 'Initialisierung fehlgeschlagen, sieh dir die Protokolle der Integration an.',
    es: 'La inicialización ha fallado, consulte los registros de la integración.',
  },
};

// Pieces of the server reports, one table per language.
export const REPORT_TEXT = {
  en: {
    unreachable: (count, total) => `${count} of ${total} apcupsd server(s) unreachable:`,
    invalid: (list) => `Ignored entries: ${list}.`,
    none: 'No valid server address.',
    ok: 'answers',
    hint: {
      REFUSED: 'connection refused: is the network server on (NISIP 0.0.0.0)?',
      TIMEOUT: 'no answer: check the address, the port and the firewall',
      NOT_FOUND: 'unknown host name: enter an IP address',
      UNREACHABLE: 'host unreachable',
      CLOSED: 'connection closed: is it an apcupsd server?',
      INVALID: 'unexpected answer: is it an apcupsd server?',
      NETWORK: 'network error',
    },
  },
  fr: {
    unreachable: (count, total) => `${count} serveur(s) apcupsd sur ${total} injoignable(s) :`,
    invalid: (list) => `Entrées ignorées : ${list}.`,
    none: 'Aucune adresse de serveur valide.',
    ok: 'répond',
    hint: {
      REFUSED: 'connexion refusée : le serveur réseau est-il actif (NISIP 0.0.0.0) ?',
      TIMEOUT: "pas de réponse : vérifiez l'adresse, le port et le pare-feu",
      NOT_FOUND: 'nom inconnu : saisissez une adresse IP',
      UNREACHABLE: 'hôte injoignable',
      CLOSED: 'connexion fermée : est-ce bien un serveur apcupsd ?',
      INVALID: 'réponse inattendue : est-ce bien un serveur apcupsd ?',
      NETWORK: 'erreur réseau',
    },
  },
  de: {
    unreachable: (count, total) => `${count} von ${total} apcupsd-Server(n) nicht erreichbar:`,
    invalid: (list) => `Ignorierte Einträge: ${list}.`,
    none: 'Keine gültige Serveradresse.',
    ok: 'antwortet',
    hint: {
      REFUSED: 'Verbindung abgelehnt: Ist der Netzwerkserver aktiv (NISIP 0.0.0.0)?',
      TIMEOUT: 'keine Antwort: Prüfe Adresse, Port und Firewall',
      NOT_FOUND: 'unbekannter Hostname: Gib eine IP-Adresse ein',
      UNREACHABLE: 'Host nicht erreichbar',
      CLOSED: 'Verbindung geschlossen: Ist das ein apcupsd-Server?',
      INVALID: 'unerwartete Antwort: Ist das ein apcupsd-Server?',
      NETWORK: 'Netzwerkfehler',
    },
  },
  es: {
    unreachable: (count, total) => `${count} de ${total} servidor(es) apcupsd inaccesible(s):`,
    invalid: (list) => `Entradas ignoradas: ${list}.`,
    none: 'Ninguna dirección de servidor válida.',
    ok: 'responde',
    hint: {
      REFUSED: 'conexión rechazada: ¿está activo el servidor de red (NISIP 0.0.0.0)?',
      TIMEOUT: 'sin respuesta: compruebe la dirección, el puerto y el cortafuegos',
      NOT_FOUND: 'nombre desconocido: introduzca una dirección IP',
      UNREACHABLE: 'equipo inaccesible',
      CLOSED: 'conexión cerrada: ¿es un servidor apcupsd?',
      INVALID: 'respuesta inesperada: ¿es un servidor apcupsd?',
      NETWORK: 'error de red',
    },
  },
};
