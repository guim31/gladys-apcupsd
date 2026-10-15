# apcupsd statuses

Real statuses of the apcupsd network information server (NIS), as published
by the projects below. Serial numbers are replaced by invented ones; nothing
else is changed.

| File                   | UPS                              | Source                                                                                                                                                | Licence    |
| ---------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `back-ups-es-600.json` | Back-UPS ES 600 (USB), 3.14.14   | Home Assistant, `tests/components/apcupsd/__init__.py` (`MOCK_STATUS`)                                                                                | Apache-2.0 |
| `minimal-3.8.5.json`   | old apcupsd, no model nor serial | Home Assistant, `MOCK_MINIMAL_STATUS` (adapted by them from the apcupsd manual)                                                                       | Apache-2.0 |
| `smart-ups-1400.json`  | SMART-UPS 1400, 3.14.12          | [aioapcaccess](https://github.com/yuxincs/aioapcaccess), `tests/__init__.py` (`PARSED_DICT`)                                                          | MIT        |
| `smart-ups-1400.nis`   | the same, raw bytes on the wire  | aioapcaccess, `SAMPLE_STATUS`: the exact answer to the `status` command: length-prefixed records and the empty end record (serial of the same length) | MIT        |

`smart-ups-1400.nis` keeps the bytes of `SAMPLE_STATUS` except two record
lengths: the aioapcaccess authors edited the `HOSTNAME` line and added a second
`LOADPCT` line without updating their length prefix, which apcupsd always
writes right.

The on-battery, low-battery and lost-communication cases of the tests are
derived from these statuses by changing their `STATUS` field, the way apcupsd
writes it.
