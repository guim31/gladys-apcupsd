# APC UPS Daemon for Gladys Assistant

An external integration for [Gladys Assistant](https://gladysassistant.com)
that follows APC UPSs monitored by [apcupsd](http://www.apcupsd.org), the
daemon Unraid, many NAS and Linux servers use, through its network information
server (NIS, TCP port 3551). Local network only, no cloud, no account,
read-only.

> **Tested on real hardware: an APC Smart-UPS SRT connected over USB to an
> Unraid server running apcupsd 3.14.** It is also tested against real apcupsd
> statuses published by the Home Assistant and aioapcaccess projects (a
> Back-UPS ES 600, a SMART-UPS 1400, an old apcupsd 3.8) and a simulated NIS
> server. Feedback on other models is welcome.
> Please report what works and what does not in the
> [issues](https://github.com/guim31/gladys-apcupsd/issues), with the output
> of `apcaccess status` (hide the serial number).

This integration is not affiliated with APC or Schneider Electric.

## Features

- **One device per UPS** (one apcupsd server monitors one UPS; several servers
  can be configured): state in words (on mains, on battery, low battery,
  replace battery, overload…), mains power (on/off, for scene conditions), low
  battery, battery charge, runtime, load, estimated power and its cumulative
  **energy**, input, output and battery voltages, internal temperature, time on
  battery, number of transfers, last transfer and its reason, battery date,
  model, serial number. A feature is only published when the UPS reports it.
- **Energy tracking**: the power is estimated (load × nominal power) and
  integrated into a kWh index Gladys turns into a consumption and a cost, like
  a smart plug. The index is kept under `/data` and never goes backwards.
- **Scene triggers**: _power outage_ (switch to battery), _power restored_
  (with the outage duration), _battery low_, _replace the battery_; for one UPS
  or any.
- **Dashboard widget** "UPS": the state in words with a color, the last
  transfer, and live tiles for battery, runtime, load and power.
- A **Check the servers** button in the Configuration screen, and a connection
  status that names the server that does not answer and why.
- A **transport badge** per device: local, unreachable when apcupsd does not
  answer, degraded when apcupsd lost the UPS.

## Requirements

- Gladys Assistant **5.1.0** or later (widgets and scene triggers).
- apcupsd with its network server on and listening on the network:
  `NETSERVER on` and `NISIP 0.0.0.0` in `apcupsd.conf` (on Unraid: the network
  server option of the UPS settings). `NISIP 127.0.0.1` refuses Gladys.

## Installation

1. In Gladys, open **Integrations → Install from GitHub** and enter
   `https://github.com/guim31/gladys-apcupsd` (or find **APC UPS Daemon** in the
   catalog once it is published).
2. In **Configuration**, enter the IP address of the apcupsd computer
   (`host` or `host:port`, several separated by commas) and press **Check the
   servers**.
3. Open the **Discovery** tab and add the UPS.

The user guide is in [`docs/en.md`](docs/en.md) (also in
[French](docs/fr.md), [German](docs/de.md) and [Spanish](docs/es.md)); Gladys
links it from the Configuration screen.

## How it works

```
Integration container ──TCP 3551: "status"──▶ apcupsd (NIS) ──USB/serial──▶ UPS
                      ◀── one record per field, then an empty record ──
```

- The NIS protocol is a few length-prefixed records; the client is under 200 lines
  of Node.js (`src/nis.js`), no dependency beside the Gladys SDK.
- The container reads every server on its own timer (5 s to 1 min, 10 s by
  default): the Gladys core does not reliably poll external devices
  (GladysAssistant/Gladys#3198). The core's poll stays as a fallback.
- Only the **changes** are published to Gladys, and every value again every
  6 hours so none looks stale.
- The UPS is identified by its **serial number** (by the server address for
  the rare UPS without one).
- `/data/apcupsd-state.json` keeps the energy index, the last status of each
  server (so a UPS whose server is down keeps its device in Discovery) and the
  last power state (so an outage that starts during a restart still fires its
  trigger). No secret is stored: the NIS has no credentials.

## Limitations

- **Tested on one real UPS** (Smart-UPS SRT over USB): other models may report fewer fields; see above.
- An outage shorter than the refresh interval can be missed by the triggers
  (the transfer counter still counts it).
- The power and the energy are estimates: apcupsd gives a load in percent of
  the nominal power, not a measurement. No power or energy feature without a
  nominal power (`NOMPOWER`).
- Read-only: the NIS has no command, so no self-test, shutdown or setting from
  Gladys. Switching a UPS off from a dashboard would be a dangerous button
  anyway.
- The transfer counter and the times on battery restart from zero with
  apcupsd.
- `.local` names do not resolve inside the integration container: use IP
  addresses.
- A UPS watched by NUT rather than apcupsd needs a NUT integration.

## Development

Node.js 22+, ESM, no build step.

```bash
npm install
npm test                              # node --test: unit tests + simulated NIS server
npm run lint
npm run format:check
node scripts/probe.mjs <host> [port]  # read-only check of a real apcupsd
npx github:GladysAssistant/integration-store .   # store validator
```

```
index.js              SDK wiring (src/app.js registers the handlers)
src/nis.js            apcupsd NIS client (status command, record framing)
src/ups.js            raw status → typed reading
src/devices.js        Gladys device and states of a UPS
src/monitor.js        own polling timer, states, triggers, connection status
src/energy.js         energy index integrated from the power
src/triggers.js       scene triggers (transitions)
src/widgets.js        the "UPS" dashboard widget
src/i18n.js           texts in English, French, German and Spanish
src/store.js          persistence under /data
```

## Credits

- [apcupsd](http://www.apcupsd.org) by Adam Kropelin, Kern Sibbald and
  contributors: the daemon, its NIS protocol and the meaning of its fields.
- [aioapcaccess](https://github.com/yuxincs/aioapcaccess) by Yuxin Wang (MIT):
  the NIS exchange this client follows, and a raw status used as a test
  fixture.
- The [Home Assistant apcupsd integration](https://www.home-assistant.io/integrations/apcupsd/)
  (Apache-2.0): the statuses used as test fixtures, and the handling of
  "Blank" serial numbers and of old `STATFLAG`-only daemons.
- [Gladys Assistant](https://gladysassistant.com) and its
  [integration SDK](https://github.com/GladysAssistant/integration-sdk-js).

## License

[Apache-2.0](LICENSE)
