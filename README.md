# Trainings-Tracker

Eine einfache, dunkle Trainings-App: Übungen, Sätze und Wiederholungen erfassen
und die Entwicklung als Graph verfolgen. Läuft komplett lokal im Browser
(Daten liegen in `localStorage` deines Geräts) und lässt sich als App auf
dem Homescreen installieren.

Alle Dateien liegen bewusst flach nebeneinander (keine Unterordner) –
so lässt sich das Projekt auch über eine Datei-für-Datei-Upload-Oberfläche
hochladen, falls der Ordner-Upload nicht funktioniert.

## Lokal testen

```bash
npm install
npm run dev
```

Öffnet unter `http://localhost:5173`.

## Online stellen (kostenlos, ca. 5 Minuten)

**Wenn Vercel bei dir nur Datei-Upload statt Ordner-Upload anbietet:**
Wähle einfach alle Dateien in diesem Ordner gleichzeitig aus (nicht den
Ordner selbst) und lade sie hoch – da es keine Unterordner gibt, geht das
problemlos.

**Am einfachsten mit Vercel:**

1. Erstelle einen kostenlosen Account auf [vercel.com](https://vercel.com)
   (Login z. B. mit GitHub geht am schnellsten).
2. Neues Projekt anlegen → alle Dateien aus diesem Ordner hochladen.
3. Vercel erkennt automatisch Vite/React. Build-Befehl: `npm run build`,
   Output-Ordner: `dist`.
4. Nach dem Deploy bekommst du eine URL wie `trainings-tracker.vercel.app`.

**Alternative: Netlify** funktioniert genauso.

## Als App auf dem Handy installieren

1. Öffne die Vercel/Netlify-URL auf deinem Handy im Browser.
2. **iPhone (Safari):** Teilen-Symbol → "Zum Home-Bildschirm".
3. **Android (Chrome):** Menü (⋮) → "App installieren" bzw.
   "Zum Startbildschirm hinzufügen".

Die App startet dann im Vollbild ohne Browserleiste, mit eigenem Icon.

## Wichtig zu den Daten

Die Trainingsdaten werden lokal in deinem Browser gespeichert
(`localStorage`). Das heißt:

- Sie bleiben erhalten, solange du Browser-Daten nicht löschst.
- Sie sind **nicht** automatisch zwischen mehreren Geräten synchronisiert –
  jedes Gerät/jeder Browser hat seinen eigenen Datenstand.

