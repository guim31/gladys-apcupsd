// -----------------------------------------------------------------------------
// Dashboard widget (manifest `widgets`, Gladys 5.1+): `ups`.
//
// One card per UPS with what matters during an outage: the state in words
// (colored), and live tiles for the battery charge, the runtime, the load and
// the estimated power. The tiles are bound to the device features, so they
// follow the states without any refresh; the status rows are not, and the
// monitor asks for a refresh when the state changes.
//
// Read-only: no button. Budget (8 components, 2 texts, 1 status, 6 tiles):
// up to four tiles, one status list, one caption.
// -----------------------------------------------------------------------------

import { WIDGET_COLORS } from '@gladysassistant/integration-sdk';
import { FEATURE_KEYS, deviceIds } from './devices.js';
import { NAMES, pick, statusText, transferReasonText } from './i18n.js';
import { WIDGET_KEY } from './monitor.js';

export const TEXT = {
  noDevice: {
    en: 'Add your UPS to Gladys from the Discovery tab of the integration.',
    fr: "Ajoutez votre onduleur à Gladys depuis l'onglet Découverte de l'intégration.",
    de: 'Füge deine USV in Gladys über den Tab „Entdecken“ der Integration hinzu.',
    es: 'Añada su SAI a Gladys desde la pestaña Descubrir de la integración.',
  },
  unreachable: {
    en: 'apcupsd unreachable',
    fr: 'apcupsd injoignable',
    de: 'apcupsd nicht erreichbar',
    es: 'apcupsd inaccesible',
  },
  waiting: {
    en: 'Waiting for a first reading',
    fr: 'En attente de la première lecture',
    de: 'Warte auf die erste Messung',
    es: 'Esperando la primera lectura',
  },
  state: { en: 'State', fr: 'État', de: 'Status', es: 'Estado' },
  lastTransfer: {
    en: 'Last transfer',
    fr: 'Dernier transfert',
    de: 'Letzte Umschaltung',
    es: 'Última transferencia',
  },
  estimated: {
    en: 'Power estimated from the load and the nominal power.',
    fr: 'Puissance estimée d’après la charge et la puissance nominale.',
    de: 'Leistung geschätzt aus Last und Nennleistung.',
    es: 'Potencia estimada a partir de la carga y la potencia nominal.',
  },
};

/** The color of the state: what needs attention first. */
export function stateColor(ups) {
  if (ups.commLost || ups.lowBattery || ups.words.has('OVERLOAD')) {
    return WIDGET_COLORS.DANGER;
  }
  if (ups.mains === 0 || ups.replaceBattery || ups.words.has('NOBATT')) {
    return WIDGET_COLORS.WARNING;
  }
  return ups.mains === 1 ? WIDGET_COLORS.SUCCESS : WIDGET_COLORS.NEUTRAL;
}

/**
 * Content of the widget for one UPS reading (pure).
 * @param {object} gladys
 * @param {{ id: string, ups?: object, error?: object, stale?: boolean }} entry
 * @param {string} language
 */
export function buildUpsContent(gladys, entry, language) {
  const ids = deviceIds(gladys, entry.id);
  const names = NAMES[language] ?? NAMES.en;
  const { ups } = entry;
  const components = [];
  const tile = (name, icon, present) => {
    if (present) {
      components.push({
        type: 'value',
        label: names[name],
        icon,
        device_feature: ids.feature(FEATURE_KEYS[name]),
      });
    }
  };
  tile('battery', 'battery-charging', ups.batteryCharge !== undefined);
  tile('runtime', 'clock', ups.timeLeft !== undefined);
  tile('load', 'activity', ups.loadPct !== undefined);
  tile('power', 'zap', ups.power !== undefined);

  const items = [];
  if (entry.error) {
    items.push({
      label: pick(TEXT.state, language),
      value: pick(TEXT.unreachable, language),
      color: WIDGET_COLORS.DANGER,
    });
  } else if (entry.stale || !ups.known) {
    items.push({
      label: pick(TEXT.state, language),
      value: pick(TEXT.waiting, language),
      color: WIDGET_COLORS.NEUTRAL,
    });
  } else {
    items.push({
      label: pick(TEXT.state, language),
      value: statusText(ups.words, language).slice(0, 40),
      color: stateColor(ups),
    });
  }
  const reason = transferReasonText(ups.lastTransferReason, language);
  if (reason || ups.lastTransferAt) {
    items.push({
      label: pick(TEXT.lastTransfer, language),
      value: [ups.lastTransferAt, reason].filter(Boolean).join(' · ').slice(0, 40),
      color: WIDGET_COLORS.NEUTRAL,
    });
  }
  components.push({ type: 'status', items });
  if (ups.power !== undefined) {
    components.push({ type: 'text', variant: 'caption', text: pick(TEXT.estimated, language) });
  }
  return { ttl_seconds: 60, components };
}

export const WIDGETS = {
  [WIDGET_KEY]: {
    /**
     * @param {import('./monitor.js').Monitor} monitor
     * @param {{ settings?: object, language?: string }} request
     */
    get(monitor, { settings = {}, language = 'en' } = {}) {
      const entries = monitor.createdEntries();
      const chosen =
        entries.find((entry) => deviceIds(monitor.gladys, entry.id).device === settings.ups) ??
        entries[0];
      if (!chosen || !chosen.ups) {
        return {
          ttl_seconds: 60,
          components: [{ type: 'text', variant: 'body', text: pick(TEXT.noDevice, language) }],
        };
      }
      return buildUpsContent(monitor.gladys, chosen, language);
    },
  },
};
