# Ashfall — a procedural Vvardenfell roguelike

A first-person, fully procedural roguelike in the spirit of *The Elder Scrolls III: Morrowind*, built with Three.js and Vite. Every run generates a new island from a seed. You get one life and no saves.

## Play

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/ (relative paths, host anywhere)
npm test         # logic tests (world gen, dungeons, leveling, quests)
```

Click the game to capture the mouse. Esc releases it.

| Key | Action |
| --- | --- |
| WASD / mouse | Move / look |
| Left mouse (hold, release) | Attack. Holding longer gives a stronger swing or a fuller bow draw |
| F or right mouse | Cast the selected spell |
| Mouse wheel, 1–9, [ ] | Select a spell or power |
| E | Talk, open, loot, enter doors, use stairs |
| Shift / Space / C | Sprint / jump / toggle sneak |
| Q | Drink a healing potion |
| T | Rest (level-ups happen when you rest) |
| Tab or I · K · M · J | Inventory · character · map · journal |

## What's generated

- **The island.** A seeded heightmap with Red Mountain and its crater, surrounded by seven regions arranged at random: Ashlands, West Gash, Bitter Coast, Ascadian Isles, Grazelands, Azura's Coast and Molag Amur (with lava fields). Each region has its own palette, flora (emperor parasols, swamp trees, dead trees, grass and rocks), weather (ash storms, blight storms, rain, fog) and creatures. There's a day/night cycle, and the moons Masser and Secunda rise at night.
- **Towns.** Eight settlements with generated names, built in the Imperial, Redoran, Hlaalu, Telvanni or Ashlander style. They contain temples, guild halls, Great House councils, traders, smiths, guards and townsfolk, plus a silt strider port for fast travel.
- **Dungeons.** Twenty sites of four kinds. Caves use cellular automata. Ancestral tombs, Dwemer ruins and Daedric shrines use rooms and corridors. Each has one to three levels, with themed monsters, props, locked chests, loot tiers and a named boss on the bottom level.
- **NPCs, loot and quests.** Names come from race-specific syllable tables. Weapons and armor are built from materials running from iron to daedric, with random enchantments. Guild duties are generated: clear a dungeon, bounties, retrieve an artifact, cull creatures, or deliver a package. Rumors reveal dungeons on your map.

## Morrowind systems

- **Character creation.** 10 races, 14 classes and 13 birthsigns, each with the attributes, skill bonuses, resistances, powers and magicka modifiers you'd expect.
- **Skills improve through use** (24 skills). Every 10 increases in major or minor skills earns a level when you rest. Attribute multipliers (×2 to ×5) depend on which skills you trained.
- **Combat.** Hit chance comes from skill, agility, luck and fatigue, so misses happen, as in the original. Armor rating and armor skills, block with a shield, sneak attacks for triple damage, bows and arrows, and falling damage.
- **Magic.** Destruction, Restoration, Alteration, Illusion, Mysticism and Conjuration spells, including bound weapons, Divine and Almsivi Intervention, Detect Creature, Open Lock, Calm and Paralyze. Racial and birthsign powers can be used once a day. Spell success chance applies.
- **Factions.** Fighters, Mages and Thieves Guilds, the Temple, the Imperial Legion, the Morag Tong, and Houses Redoran, Hlaalu and Telvanni (you may join only one House). Ten ranks each, gated on reputation and favored skills.
- **Dialogue.** Disposition, persuasion (admire, intimidate, bribe), barter priced by mercantile skill, training (five sessions per level), spell merchants, temple healing and silt strider travel.

## Main quest

A Blades contact waits in your starting town. They send you after Kagrenac's tools (Sunder, Keening and Wraithguard), each held by the boss of a different stronghold. With all three in hand, the ward on the Citadel in Red Mountain's crater opens. Descend and kill the Dagoth lord to win. Your score counts levels, kills, dungeons, quests, relics, gold and days survived, and past runs are listed on the title screen.

## Code layout

```
src/core/     seeded RNG and Perlin noise
src/data/     races, classes, birthsigns, skills, spells, items, creatures, factions, name tables
src/logic/    pure, testable generation and rules (world, dungeons, character, combat, items, quests)
src/render/   Three.js builders: terrain, flora, buildings, creatures, dungeons, sky, first-person view
src/game/     runtime: game loop, areas, actors and AI, player controller, dialogue services, audio, input
src/ui/       HUD, menus, dialogue, character creation, title/death/victory screens
tests/        node:test suites for the logic layer
```

All art and audio are procedural. There are no asset files.
