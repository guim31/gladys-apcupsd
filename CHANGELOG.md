# Changelog

All notable changes to this integration are documented in this file. The format
follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project
uses [semantic versioning](https://semver.org/).

Describe each change under `## [Unreleased]` as you make it. The Release
workflow moves that section under the version it ships, and the section becomes
the notes of the version's GitHub Release.

## [Unreleased]

## [1.0.2] - 2026-10-22

### Security

- Rebuilt on Node.js 24.22.1, the October 2026 security release (remote code
  execution in the Brotli decoder, CVE-2026-111497; TLS hostname and DNS
  fixes).

## [1.0.1] - 2026-10-15

### Added

- APC UPSs monitored by apcupsd, read through its network information server
  (TCP 3551), one or several servers. Read-only, local network only.
- One device per UPS: state in words, mains power, low battery, battery charge,
  runtime, load, estimated power, input, output and battery voltages, internal
  temperature, time on battery, number of transfers, last transfer and its
  reason, battery date, model and serial number.
- Energy tracking: a cumulative kWh index estimated from the load and the
  nominal power, which Gladys turns into a consumption and a cost.
- Scene triggers: power outage, power restored (with the outage duration),
  battery low, replace the battery.
- "UPS" dashboard widget: the state with a color, the last transfer, and live
  tiles for battery, runtime, load and power.
- "Check the servers" button, a connection status naming the server that does
  not answer and why, and a transport badge per device.
- Texts and documentation in English, French, German and Spanish.

[Unreleased]: https://github.com/guim31/gladys-apcupsd/compare/v1.0.2...HEAD
[1.0.2]: https://github.com/guim31/gladys-apcupsd/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/guim31/gladys-apcupsd/releases/tag/v1.0.1
