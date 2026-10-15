# APC UPS Daemon

Follow your APC UPSs in Gladys through **apcupsd**, the daemon Unraid, many NAS
and Linux servers use to watch their UPS: power outages, battery charge,
runtime, load, voltages, an estimate of the power drawn by your equipment and
its energy. Scenes can react to a power outage, to the power coming back, to a
low battery and to a battery to replace.

> **Developed without the hardware: feedback welcome.** The integration was
> built and tested against real apcupsd answers published by other projects,
> not against a UPS on a desk. If something looks wrong with your model, open
> an issue on GitHub with the output of `apcaccess status` (hide the serial
> number).

This integration is not affiliated with APC or Schneider Electric.

## Requirements

- Gladys Assistant 5.1.0 or later.
- A UPS connected (USB or serial cable) to a computer running **apcupsd**: a
  Linux server, a NAS, an Unraid server, a Raspberry Pi…
- The **network information server** (NIS) of apcupsd turned on and listening
  on the network, on port 3551 (the default). This is the read-only service
  `apcaccess` and Home Assistant use.

### apcupsd on Linux or Windows

In `apcupsd.conf` (usually `/etc/apcupsd/apcupsd.conf`), check these three
lines:

```
NETSERVER on
NISIP 0.0.0.0
NISPORT 3551
```

`NISIP 127.0.0.1` (the default on some distributions) only answers the
computer itself: Gladys, in its container, is refused. Restart apcupsd after
the change (`sudo systemctl restart apcupsd`), then check from another computer
that port 3551 answers.

### Unraid

Unraid runs apcupsd itself: open **Settings → UPS Settings**, turn on the
network server option ("Enable network server") and apply. If the integration
still gets "connection refused", the server listens on the Unraid computer
only: check the `NISIP` line of `/etc/apcupsd/apcupsd.conf` on Unraid.

## Configuration

In Gladys, open **Integrations → APC UPS Daemon → Configuration**:

- **apcupsd servers**: the IP address of the computer running apcupsd, followed
  by `:port` if the port is not 3551. One apcupsd serves one UPS: for several
  UPSs, enter several servers separated by commas, for example
  `192.0.2.10, 192.0.2.11:3552`. Prefer IP addresses: `.local` names do not
  resolve inside the integration container.
- **Refresh interval**: 5, 10 (default), 30 seconds or 1 minute. A power outage
  is seen within this delay.
- **Language of the device texts**: the language of the feature names of new
  devices and of the texts the UPS shows (state, last transfer reason). French
  by default.

The **Check the servers** button reads every server and says which ones
answer, with their model, or why they do not.

Then open the **Discovery** tab and add your UPS to Gladys.

## The UPS device

Each UPS is a device. A feature only exists when your UPS reports the
matching value (a Back-UPS has no internal temperature, an old Smart-UPS no
nominal power). Everything is read-only: the network server of apcupsd cannot
send commands, and no button switches a UPS off.

| Feature                                 | What it shows                                                                        |
| --------------------------------------- | ------------------------------------------------------------------------------------ |
| State                                   | The state in words: On mains, On battery, Low battery, Replace battery, Overload…    |
| Mains power                             | On (1) on mains, Off (0) during a power outage: the value to use in scene conditions |
| Low battery                             | Yes when the UPS says the battery is low: shutdown is near                           |
| Battery charge                          | Battery charge, in %                                                                 |
| Runtime                                 | Runtime left on battery, in minutes, as the UPS estimates it                         |
| Load                                    | Load of the UPS, in % of its capacity                                                |
| Power                                   | Power drawn by your equipment, in W, **estimated**: load × nominal power             |
| Energy                                  | Cumulative energy, in kWh, computed from the power (see below)                       |
| Input / output / battery voltage        | In volts                                                                             |
| Internal temperature                    | In °C                                                                                |
| Time on battery / Total time on battery | Current outage, and since apcupsd started, in seconds                                |
| Transfers                               | Number of transfers to battery since apcupsd started                                 |
| Last transfer / Last transfer reason    | Date and reason of the last transfer to battery (self-test, low mains voltage…)      |
| Battery date, Model, Serial number      | As the UPS reports them                                                              |

### Energy tracking

apcupsd gives a load in percent, not an energy meter. When the UPS reports its
nominal power, the integration estimates the power (load × nominal power) and
adds it up over time into an **Energy** index, in kWh. Gladys turns this index
into a consumption every 30 minutes and its cost, like a smart plug: the
**Energy** screen of Gladys then shows what your server corner uses. The index
is kept in the integration's data, so it never goes backwards when the
integration restarts. It is an estimate: count on a few percent of error,
and more at very low load.

## Widget

The **UPS** widget shows, for the UPS chosen in its settings (the first one
added by default), the state in words with a color (green on mains, orange on
battery or battery to replace, red for a low battery, an overload or a lost
UPS), the last transfer, and live tiles for the battery charge, the runtime,
the load and the estimated power.

## Scene triggers

Four triggers, in the scene editor under the integration's name. Each one can
watch one UPS, or any UPS when the field is left empty.

| Trigger                  | When                                     | Variables                                 |
| ------------------------ | ---------------------------------------- | ----------------------------------------- |
| UPS: power outage        | the UPS switches to battery              | UPS name, battery charge, runtime         |
| UPS: power restored      | the UPS is back on mains after an outage | UPS name, battery charge, outage duration |
| UPS: battery low         | the UPS reports a low battery            | UPS name, battery charge, runtime         |
| UPS: replace the battery | the UPS asks for a new battery           | UPS name, battery date                    |

A trigger fires once per change, never on the first reading after a start. A
change that happens while the integration restarts still fires, as long as
the restart takes less than 30 minutes.

## Scene examples

### Warn me of a power outage

Trigger **UPS: power outage**, action **Send a message**: "Power outage!
[UPS name] is on battery, [Battery charge] % left, about [Runtime] minutes."
The words in brackets are the trigger variables: type `{{` in the message to
insert them.

### Turn off what is not needed during an outage

Trigger **UPS: power outage**, actions: turn off the plugs of the screens,
the printer and the lights the UPS feeds, to make the battery last.

### Tell me when the power is back

Trigger **UPS: power restored**, action **Send a message**: "Power is back
after [Outage duration] seconds."

## Troubleshooting

- **"connection refused"**: the network server of apcupsd is off, or listens on
  the apcupsd computer only (`NISIP 127.0.0.1`). See the requirements.
- **"no answer"**: wrong address or port, or a firewall between Gladys and the
  apcupsd computer. Port 3551 must be open in TCP.
- **"unknown host name"**: enter the IP address instead of the name.
- **The State says "UPS not responding"**: apcupsd answers, but lost the UPS
  itself (USB cable, driver). Look at the apcupsd computer.
- **No Power nor Energy feature**: your UPS does not report its nominal power
  (`NOMPOWER` in `apcaccess status`).
- **Logs**: the integration only writes its start, the servers found, outages
  and errors. Set `LOG_LEVEL=debug` on the container to see every read.

## Limits

- An outage shorter than the refresh interval can be missed (the Transfers
  counter still counts it).
- The power and the energy are estimates, not measurements.
- The Transfers counter and the times on battery start again from zero when
  apcupsd restarts.
- Read-only: no self-test, no shutdown, no setting changes from Gladys.
- Developed without the hardware: tested with real apcupsd statuses (Back-UPS
  ES 600, SMART-UPS 1400, an old apcupsd 3.8) and a simulated server.
- For a UPS watched by NUT instead of apcupsd, use a NUT integration.
