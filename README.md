# Made to Measure

A two-minute **Beyond Data** story for the sales team, played in **augmented reality** on an Android phone
(Chrome, WebXR) or in a Meta Quest: a miniature office is placed on a table, and the story happens all around you.

**BEFORE** — business intelligence on Qlik and Power BI, months-long projects, vendor lock-in.
**NOW** — AI coding assistants join the team: custom applications, built in days, vendor-free.
**THE FUTURE** — competitors have the same AI. The difference is who gets to the client first.

▶ **https://mge-agilos.github.io/MadeToMeasure/**

## How to watch

- **Android phone**: open the link in Chrome, tap *Place it in my room*, point at a table and tap the screen. Sound on.
  Walk around the table and look up, left, right and down.
- **Meta Quest**: open the link in the Quest browser and tap *Watch in VR*.
- **Computer**: *Preview on this screen* (drag to orbit).

## Development

```
npm install
npm run dev      # https://<your-ip>:5173 (accept the certificate warning)
npm run build    # → dist/
```

Source of truth: the `pitch/` folder of the VR projects workspace (exported with `pitch/scripts/export.mjs`).

## Credits

Characters: Quaternius (CC0) · office and city: Kenney (CC0) · animations: Quaternius Universal Animation Library (CC0) ·
music: Kevin MacLeod, incompetech.com (CC BY 4.0) — *Thinking Music*, *Inspired*, *Motivator* ·
voice and sound effects: ElevenLabs · logo and brand: Beyond Data.
