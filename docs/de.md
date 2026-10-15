# APC UPS Daemon

Verfolge deine APC-USVs in Gladys über **apcupsd**, den Dienst, mit dem Unraid,
viele NAS und Linux-Server ihre USV überwachen: Stromausfälle, Batterieladung,
Restlaufzeit, Last, Spannungen, eine Schätzung der Leistung deiner Geräte und
ihrer Energie. Szenen können auf einen Stromausfall, auf die Rückkehr des
Stroms, auf eine schwache Batterie und auf eine zu ersetzende Batterie
reagieren.

> **Mit echter Hardware getestet: eine APC Smart-UPS SRT, per USB an einem
> Unraid-Server mit apcupsd 3.14.** Außerdem mit echten apcupsd-Antworten
> getestet, die andere Projekte veröffentlicht haben. Wenn bei deinem Modell
> etwas nicht stimmt, eröffne ein Issue auf GitHub mit der Ausgabe von
> `apcaccess status` (Seriennummer unkenntlich machen).

Diese Integration steht in keiner Verbindung zu APC oder Schneider Electric.

## Voraussetzungen

- Gladys Assistant 5.1.0 oder neuer.
- Eine USV, die (per USB- oder seriellem Kabel) an einem Rechner hängt, auf dem
  **apcupsd** läuft: Linux-Server, NAS, Unraid-Server, Raspberry Pi…
- Der **Netzwerk-Informationsserver** (NIS) von apcupsd ist eingeschaltet und
  lauscht im Netzwerk, auf Port 3551 (Standard). Das ist der schreibgeschützte
  Dienst, den `apcaccess` und Home Assistant nutzen.

### apcupsd unter Linux oder Windows

Prüfe in `apcupsd.conf` (meist `/etc/apcupsd/apcupsd.conf`) diese drei Zeilen:

```
NETSERVER on
NISIP 0.0.0.0
NISPORT 3551
```

`NISIP 127.0.0.1` (der Standard mancher Distributionen) antwortet nur dem
Rechner selbst: Gladys wird in seinem Container abgewiesen. Starte apcupsd nach
der Änderung neu (`sudo systemctl restart apcupsd`) und prüfe dann von einem
anderen Rechner aus, dass Port 3551 antwortet.

### Unraid

Unraid betreibt apcupsd selbst: Öffne **Settings → UPS Settings**, schalte die
Option des Netzwerkservers ein („Enable network server“) und übernimm sie.
Meldet die Integration weiterhin „Verbindung abgelehnt“, lauscht der Server nur
auf dem Unraid-Rechner: Prüfe die Zeile `NISIP` in `/etc/apcupsd/apcupsd.conf`
auf Unraid.

## Konfiguration

Öffne in Gladys **Integrationen → APC UPS Daemon → Konfiguration**:

- **apcupsd-Server**: die IP-Adresse des Rechners, auf dem apcupsd läuft,
  gefolgt von `:Port`, wenn der Port nicht 3551 ist. Ein apcupsd bedient eine
  USV: Für mehrere USVs gibst du mehrere Server durch Kommas getrennt ein, zum
  Beispiel `192.0.2.10, 192.0.2.11:3552`. Nimm lieber IP-Adressen: `.local`-Namen
  werden im Container der Integration nicht aufgelöst.
- **Aktualisierungsintervall**: 5, 10 (Standard), 30 Sekunden oder 1 Minute.
  Ein Stromausfall wird innerhalb dieser Zeit erkannt.
- **Sprache der Gerätetexte**: die Sprache der Funktionsnamen neuer Geräte und
  der Texte der USV (Status, Grund der letzten Umschaltung). Standardmäßig
  Französisch.

Die Schaltfläche **Server prüfen** liest jeden Server und zeigt, welche
antworten, mit ihrem Modell, oder warum sie nicht antworten.

Öffne danach den Tab **Entdecken** und füge deine USV zu Gladys hinzu.

## Das USV-Gerät

Jede USV ist ein Gerät. Eine Funktion gibt es nur, wenn deine USV den
passenden Wert liefert (eine Back-UPS hat keine Innentemperatur, eine alte
Smart-UPS keine Nennleistung). Alles ist schreibgeschützt: Der Netzwerkserver
von apcupsd kann keine Befehle senden, und keine Schaltfläche schaltet eine USV
aus.

| Funktion                                                | Was sie zeigt                                                                                      |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Status                                                  | Der Status in Worten: Netzbetrieb, Batteriebetrieb, Batterie schwach, Batterie ersetzen, Überlast… |
| Netzstrom                                               | An (1) im Netzbetrieb, Aus (0) während eines Stromausfalls: der Wert für Szenenbedingungen         |
| Batterie schwach                                        | Ja, wenn die USV eine schwache Batterie meldet: Die Abschaltung steht bevor                        |
| Batterieladung                                          | Ladung der Batterie, in %                                                                          |
| Restlaufzeit                                            | Verbleibende Laufzeit im Batteriebetrieb, in Minuten, von der USV geschätzt                        |
| Last                                                    | Last der USV, in % ihrer Kapazität                                                                 |
| Leistung                                                | Leistung deiner Geräte, in W, **geschätzt**: Last × Nennleistung                                   |
| Energie                                                 | Kumulierte Energie, in kWh, aus der Leistung berechnet (siehe unten)                               |
| Eingangs- / Ausgangs- / Batteriespannung                | In Volt                                                                                            |
| Innentemperatur                                         | In °C                                                                                              |
| Zeit im Batteriebetrieb / Gesamtzeit im Batteriebetrieb | Aktueller Ausfall und seit dem Start von apcupsd, in Sekunden                                      |
| Anzahl Umschaltungen                                    | Anzahl der Umschaltungen auf Batterie seit dem Start von apcupsd                                   |
| Letzte Umschaltung / Grund der letzten Umschaltung      | Datum und Grund der letzten Umschaltung auf Batterie (Selbsttest, Netzspannung zu niedrig…)        |
| Batteriedatum, Modell, Seriennummer                     | So, wie die USV sie meldet                                                                         |

### Energieverfolgung

apcupsd liefert eine Last in Prozent, keinen Energiezähler. Wenn die USV ihre
Nennleistung meldet, schätzt die Integration die Leistung (Last × Nennleistung)
und summiert sie über die Zeit zu einem **Energie**-Index in kWh. Gladys macht
daraus alle 30 Minuten einen Verbrauch und dessen Kosten, wie bei einer
smarten Steckdose: Der **Energie**-Bildschirm von Gladys zeigt dann, was deine
Serverecke verbraucht. Der Index wird in den Daten der Integration gespeichert
und geht daher nie zurück, wenn die Integration neu startet. Es ist eine
Schätzung: Rechne mit einigen Prozent Abweichung, bei sehr geringer Last mit
mehr.

## Widget

Das Widget **USV** zeigt für die in seinen Einstellungen gewählte USV
(standardmäßig die zuerst hinzugefügte) den Status in Worten mit einer Farbe
(grün im Netzbetrieb, orange im Batteriebetrieb oder bei zu ersetzender
Batterie, rot bei schwacher Batterie, Überlast oder einer USV, die nicht
antwortet), die letzte Umschaltung und Live-Kacheln für Batterieladung,
Restlaufzeit, Last und geschätzte Leistung.

## Szenenauslöser

Vier Auslöser, im Szeneneditor unter dem Namen der Integration. Jeder kann eine
USV überwachen, oder jede beliebige, wenn das Feld leer bleibt.

| Auslöser               | Wann                                                  | Variablen                                        |
| ---------------------- | ----------------------------------------------------- | ------------------------------------------------ |
| USV: Stromausfall      | die USV schaltet auf Batterie um                      | Name der USV, Batterieladung, Restlaufzeit       |
| USV: Strom wieder da   | die USV läuft nach einem Ausfall wieder mit Netzstrom | Name der USV, Batterieladung, Dauer des Ausfalls |
| USV: Batterie schwach  | die USV meldet eine schwache Batterie                 | Name der USV, Batterieladung, Restlaufzeit       |
| USV: Batterie ersetzen | die USV verlangt eine neue Batterie                   | Name der USV, Batteriedatum                      |

Ein Auslöser feuert einmal pro Änderung, nie bei der ersten Messung nach einem
Start. Eine Änderung während eines Neustarts der Integration löst trotzdem aus,
sofern der Neustart weniger als 30 Minuten dauert.

## Szenenbeispiele

### Bei einem Stromausfall benachrichtigen

Auslöser **USV: Stromausfall**, Aktion **Nachricht senden**: „Stromausfall!
[Name der USV] läuft auf Batterie, noch [Batterieladung] %, etwa
[Restlaufzeit] Minuten.“ Die Wörter in Klammern sind die Variablen des
Auslösers: Tippe `{{` in die Nachricht, um sie einzufügen.

### Bei einem Ausfall Unnötiges ausschalten

Auslöser **USV: Stromausfall**, Aktionen: die Steckdosen der Bildschirme, des
Druckers und der Lampen ausschalten, die an der USV hängen, damit die Batterie
länger hält.

### Melden, wenn der Strom zurück ist

Auslöser **USV: Strom wieder da**, Aktion **Nachricht senden**: „Der Strom ist
nach [Dauer des Ausfalls] Sekunden zurück.“

## Fehlerbehebung

- **„Verbindung abgelehnt“**: Der Netzwerkserver von apcupsd ist aus oder
  lauscht nur auf dem apcupsd-Rechner (`NISIP 127.0.0.1`). Siehe
  Voraussetzungen.
- **„keine Antwort“**: falsche Adresse oder falscher Port, oder eine Firewall
  zwischen Gladys und dem apcupsd-Rechner. Port 3551 muss für TCP offen sein.
- **„unbekannter Hostname“**: Gib statt des Namens die IP-Adresse ein.
- **Der Status zeigt „USV antwortet nicht“**: apcupsd antwortet, hat aber die
  USV selbst verloren (USB-Kabel, Treiber). Sieh am apcupsd-Rechner nach.
- **Keine Funktion Leistung oder Energie**: Deine USV meldet ihre Nennleistung
  nicht (`NOMPOWER` in `apcaccess status`).
- **Protokolle**: Die Integration schreibt nur ihren Start, die gefundenen
  Server, Ausfälle und Fehler. Setze `LOG_LEVEL=debug` am Container, um jede
  Messung zu sehen.

## Grenzen

- Ein Ausfall, der kürzer als das Aktualisierungsintervall ist, kann übersehen
  werden (der Zähler der Umschaltungen zählt ihn trotzdem).
- Leistung und Energie sind Schätzungen, keine Messungen.
- Die Anzahl der Umschaltungen und die Zeiten im Batteriebetrieb beginnen bei
  null, wenn apcupsd neu startet.
- Nur lesend: kein Selbsttest, kein Herunterfahren, keine Änderung von
  Einstellungen aus Gladys.
- Mit einer echten USV getestet (Smart-UPS SRT per USB) und mit echten apcupsd-Status (Back-UPS
  ES 600, SMART-UPS 1400, ein altes apcupsd 3.8) und einem simulierten Server.
- Für eine USV, die NUT statt apcupsd überwacht, nutze eine NUT-Integration.
