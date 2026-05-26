# HA-Climate-in-a-Row

[![Open your Home Assistant instance and open a repository inside the Home Assistant Community Store.](https://my.home-assistant.io/badges/hacs_repository.svg)](https://my.home-assistant.io/redirect/hacs_repository/?owner=GB-1972&repository=HA-Climate-in-a-Row&category=plugin)

Lovelace-Custom-Card für Home Assistant: mehrere `climate`-Entitäten kompakt nebeneinander/untereinander mit **Sollwert-Slider (vertikal oder horizontal), Soll-/Raumtemperatur, HVAC-Action, Fensterstatus, HVAC-Mode-Button und Preset-Dropdown** pro Thermostat. Mushroom-Look, ohne weitere Abhängigkeiten, keine Build-Pipeline.

Schwester-Karte zu [HA-Slider-in-a-Row](https://github.com/GB-1972/HA-Slider-in-a-Row) (für `cover`-Entitäten).

## Features

- **Slider-Orientierung wählbar**: vertikal (kompakte Säulen) oder horizontal (breite Zeilen).
- **Beliebig viele Thermostate** in Reihe/Stapel — Anordnung über `stacks` (vertikale Säulen, column-fill) oder `cols` (Reihen, row-fill).
- **Solltemperatur** als großer Hauptwert; live-Vorschau beim Slider-Ziehen (Service-Call erst beim Loslassen).
- **+/-Buttons** rechts/links bzw. ober/unter dem Slider mit `target_temp_step` aus der Entität; an Min/Max-Endlagen ausgegraut.
- **Raumtemperatur** als kleiner Sekundärwert.
- **HVAC-Action**-Pill: `heating`/`cooling`/`idle`/`off`/`fan`/`drying`/`defrosting`/`preheating` mit passendem Icon und Farbe.
- **Fenster-Symbol**: zeigt rot ein offenes Fenster an, wenn der per Konfiguration zugeordnete `binary_sensor` `on` ist. Ohne konfigurierten Sensor wird nie ein Symbol angezeigt.
- **HVAC-Mode-Button**: rotiert beim Klick durch die `hvac_modes` der Entität (z. B. `off → heat → cool → auto → off`). Farbe passt zum aktuellen Mode.
- **Preset-Dropdown**: zeigt `preset_modes` der Entität, setzt `preset_mode` beim Wechsel.
- **UI-Editor**: Entity-Picker mit Climate-Filter, alle Layout-/Farb-/Anzeige-Optionen klickbar, **pro Thermostat ein Name-Feld und ein Dropdown für den Fensterkontakt-Binarysensor**.
- **Long-Press / Rechtsklick** öffnet das HA-„Weitere Infos"-Popup.
- Responsive: kompaktere Buttons und Schrift auf Mobile.
- `unavailable`/`unknown` wird ausgegraut.

## Installation

### Ein-Klick über HACS

Klick auf den Badge oben → HACS öffnet sich auf deiner Instanz und bietet an, das Repo als **Custom Repository / Plugin** hinzuzufügen.

Alternativ manuell in HACS:
1. HACS → Frontend → drei Punkte oben rechts → *Custom repositories*.
2. URL: `https://github.com/GB-1972/HA-Climate-in-a-Row`, Kategorie: **Lovelace**.
3. *Climate Row* installieren.

### Manuell

1. [`climate-row-card.js`](climate-row-card.js) nach `config/www/` kopieren.
2. **Einstellungen → Dashboards → Ressourcen** → hinzufügen:
   - URL: `/local/climate-row-card.js?v=1`
   - Typ: **JavaScript-Modul**
3. Browser-Cache leeren (Shift-Reload).

## Konfiguration

Minimal:

```yaml
type: custom:climate-row-card
entities:
  - climate.wohnzimmer
  - climate.schlafzimmer
  - climate.bad
```

Vollständig:

```yaml
type: custom:climate-row-card
title: Heizung
icon: mdi:radiator
orientation: horizontal       # oder: vertical
stacks: 0                     # vertikale Saeulen (column-fill); 0 = aus
cols: 0                       # Spalten (row-fill); ignoriert wenn stacks gesetzt
slider_size: 140              # Slider-Laenge in vertikalem Modus (px)
accent_color: "#ef4444"       # CSS-Farbe (Default: rot fuer Heizung)
track_color: "rgba(127,127,127,0.18)"
show_name: true
show_target: true
show_current: true
show_hvac_action: true
show_window: true
show_preset: true
show_hvac_toggle: true
entities:
  - climate.wohnzimmer
  - entity: climate.schlafzimmer
    name: "Schlafen"
    window: binary_sensor.schlafzimmer_fenster
  - entity: climate.bad
    window: binary_sensor.bad_fenster
    current_sensor: sensor.bad_temperatur
```

### Optionen

| Option | Typ | Default | Beschreibung |
|---|---|---|---|
| `entities` | list | – | Pflicht. Liste von `climate.*`-Entity-IDs oder Objekten `{entity, name?, window?}`. Window-Sensor muss eine `binary_sensor.*`-Entität sein. |
| `title` | string | `""` | Header über der Karte. Leer = kein Header. |
| `icon` | string | `mdi:radiator` | Icon im Header. |
| `orientation` | string | `horizontal` | `horizontal` oder `vertical` — bestimmt die Slider-Richtung und das Default-Layout. |
| `slider_size` | number | `140` | Länge des Sliders im **vertikalen** Modus in px (im horizontalen Modus füllt der Slider den verfügbaren Platz). |
| `stacks` | number | – | Anzahl vertikaler Säulen, column-fill (1–N entities in Säule 1 von oben nach unten, dann Säule 2, …). Hat Vorrang vor `cols`. |
| `cols` | number | =Anzahl Entities (vertikal) bzw. `1` (horizontal) | Spalten pro Reihe (row-fill). `0`/unset → Default je nach Orientation. |
| `accent_color` | string | `#ef4444` | CSS-Farbe für Slider, Fill, Thumb, aktive Buttons. |
| `track_color` | string | `rgba(127,127,127,0.18)` | Hintergrundfarbe der Slider-Schiene. |
| `show_name` | boolean | `true` | Name oben links. |
| `show_target` | boolean | `true` | Solltemperatur (groß). |
| `show_current` | boolean | `true` | Raumtemperatur (klein, unter dem Slider). |
| `show_hvac_action` | boolean | `true` | Pill rechts oben mit aktueller `hvac_action`. |
| `show_window` | boolean | `true` | Fenster-Symbol bei offenem Sensor. |
| `show_preset` | boolean | `true` | Dropdown mit `preset_modes`. |
| `show_hvac_toggle` | boolean | `true` | Button, der durch die `hvac_modes` rotiert. |

### Pro-Entity-Optionen

In Objekt-Form `entities:`:

| Feld | Typ | Beschreibung |
|---|---|---|
| `entity` | string (Pflicht) | `climate.*`-ID des Thermostats. |
| `name` | string | Anzeigename. Leer/unset → Friendly-Name der Entität. |
| `window` | string | `binary_sensor.*`-ID des zugeordneten Fensterkontakts. Wenn der Sensor `on` ist, erscheint das Fenster-Symbol. Ohne `window` wird nie ein Symbol angezeigt. |
| `current_sensor` | string | `sensor.*`-ID eines externen Ist-Temperatur-Sensors. Wenn gesetzt und der Sensor liefert eine Zahl, wird dieser Wert als Raumtemperatur angezeigt. Ohne `current_sensor` wird das `current_temperature`-Attribut der Climate-Entität verwendet. |

### UI-Editor

Beim Hinzufügen der Karte ist der **visuelle Editor** der Default. Du wählst Entities per Multi-Picker (Cover-Filter — pardon, **Climate-Filter**), setzt Orientation, Slider-Länge, Layout (Stapel/Spalten), Farben und Anzeige-Schalter. Darunter erscheint pro ausgewähltem Thermostat ein eigener Block mit Texteingabe für den **Namen** und einem Dropdown für den **Fensterkontakt** (alle `binary_sensor`-Entitäten deiner Instanz, alphabetisch sortiert).

### Verhalten der Bedienelemente

- **Slider** setzt `temperature` über `climate.set_temperature` (erst beim Loslassen).
- **+/-Buttons** addieren/subtrahieren `target_temp_step` (Default `0.5`). Ausgegraut an `min_temp`/`max_temp`.
- **HVAC-Mode-Button** ruft `climate.set_hvac_mode` mit dem nächsten Mode aus `hvac_modes` (zyklisch).
- **Preset-Dropdown** ruft `climate.set_preset_mode` mit dem gewählten Preset.
- **Bei `unavailable`/`unknown`** sind alle Bedienelemente ausgegraut.

## Voraussetzungen

- Home Assistant mit `climate`-Entitäten, die `temperature`, `min_temp`, `max_temp` (und idealerweise `target_temp_step`, `hvac_modes`, `preset_modes`, `hvac_action`, `current_temperature`) als Attribute liefern. Praktisch alle gängigen Thermostat-Integrationen tun das.

## Lizenz

MIT
