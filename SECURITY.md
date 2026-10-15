# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes.

What the integration handles:

- **Network**: it only opens TCP connections to the apcupsd servers entered in
  its configuration (port 3551 by default) and sends them the read-only
  `status` command. It listens on no port and calls no cloud service.
- **Secrets**: none. The apcupsd network information server has no
  credentials, and the configuration holds addresses only.
- **`/data`**: `apcupsd-state.json` keeps the energy index of each UPS, the last
  status read from each server (model, serial number, readings) and the last
  power state. Nothing else is written.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
apcupsd and its network server (which anyone on the network can read: restrict
it with your firewall if that matters to you), and the UPS.
