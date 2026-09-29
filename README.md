# Ashfall — a procedural Vvardenfell roguelike

A first-person, fully procedural roguelike in the spirit of *The Elder Scrolls III: Morrowind*, built with Three.js and Vite. Every run generates a new island from a seed. You get one life: the run is saved when you leave and resumed with **Continue**, but the save is erased when you die.

## Play

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # static build in dist/ (relative paths, host anywhere)
npm test         # logic tests (world gen, dungeons, leveling, quests)
```

Click the game to capture the mouse. Esc releases it. Every key below can be rebound in **Settings** (title screen or the in-game menu), which also has mouse sensitivity, invert Y, field of view, music, effects and ambience volume, spoken NPC greetings (off by default), and a compass toggle.

The compass at the top of the screen points to your current quest targets and nearby places, and quest targets also appear on the map.

| Key | Action |
| --- | --- |
| WASD / mouse | Move / look |
| Left mouse (hold, release) | Attack. Holding longer gives a stronger swing, a fuller bow draw or a harder throw. Crossbows fire on the click, then reload. The direction you're moving picks the attack: forward thrusts, strafing slashes, standing still or backing off chops |
| F or right mouse | Cast the selected spell |
| 1–9 | Use a quick-slot (spell, power, potion or weapon). Assign slots from the inventory or magic tab |
| Mouse wheel, [ ] | Select a spell or power |
| E | Talk, open, loot, enter doors, use stairs |
| Shift / Space / C | Sprint / jump / toggle sneak |
| Q | Drink a healing potion |
| T | Rest (level-ups happen when you rest) |
| Tab or I · K · M · J | Inventory · character · map · journal |

### Controller

Xbox, PlayStation and other standard controllers work as soon as you press a button.

| Button | Action |
| --- | --- |
| Left stick / right stick | Move / look |
| RT / LT | Attack (hold for a stronger blow) / cast |
| A · B · X · Y | Jump · sneak · talk, open and use · drink a potion |
| LB / RB | Previous / next spell |
| L3 / R3 | Sprint (hold) / character sheet |
| Start / Back | Inventory / map |
| D-pad | Up rests, down opens the journal, left and right use quick-slots 1 and 2 |

In menus, the D-pad or left stick moves a highlight, A presses, B closes, and LB/RB switch tabs.

### Phones and tablets

Hold the device in landscape. Drag anywhere on the left half to move and on the right half to look. On-screen buttons cover attack, cast, jump, use, sneak, potion and sprint, with Menu, Map and Rest at the top. Tap a quick-slot to use it.

### Offline

The game installs as an app from the browser menu, or from the **Install for offline play** button on the title screen when the browser offers it. After one visit it plays without a connection, since everything is generated on the device.

## Graphics

Pick **Low / Medium / High** in Settings. Your choice is remembered, and changing it reloads the page. All art is generated at load time, in parallel web workers:

- **Textures:** about 60 procedural colour and normal maps. They cover terrain (grass, ash, rock, sand, mud, volcanic rock, dirt), architecture (plaster, timber, shingles, stone blocks, Redoran chitin, Telvanni mushroom, hide, Dwemer brass, Daedric stone, flesh) and a character/creature atlas (faces, skin, scales, fur, fabric, chainmail, plate, bonemold, bone, chitin, membrane).
- **Terrain:** split into chunks and texture-splatted with per-texture normal maps. It has fine height detail, glowing animated lava and two-layer animated water.
- **Sky:** a gradient dome with sun glow, drifting clouds, and textured Masser and Secunda.
- **Flora:** curved emperor parasols with gills and shelf fungi, layered West Gash conifers, rooted swamp trees, branching dead trees, fern and grass cards with wind sway, displaced rocks, and dense grass around the player.
- **Architecture:** timber-framed Hlaalu houses, segmented Redoran shells with spine ribs and portholes, rooted Telvanni towers with glowing bulb windows, Imperial forts with towers, gatehouses and banners, Tribunal temples, Ashlander yurts, plaza wells, market stalls and lamp posts. Windows light up at night.
- **Characters:** knee and elbow joints, race features (pointed elf ears, Khajiit muzzles and tails, Argonian snouts and frills, Orc tusks), hair styles, clothing layers, bonemold guard armour and held weapons.
- **Creatures:** each has its own anatomy, from cliff racers with sails and membrane wings to Dwemer spheres and centurions.
- **Weapons and shields:** extruded blade profiles and material finishes, including glowing glass and red-runed daedric.
- **Post-processing:** bloom makes lava, lanterns, windows, spells, glowing eyes and Daedric and glass blades glow. Ambient occlusion computed from the depth buffer darkens corners and the bases of walls. Light shafts break through trees and buildings at dawn and dusk and through ash storms. On Medium you get bloom and light shafts; High adds ambient occlusion; Low turns them off. Settings has a toggle for all three.
- **Water:** the sea knows its depth, so shallows turn turquoise and clear, and foam rolls in along every shore. Caustic light dances on the sea floor. You can dive (look down and swim forward; jump or look up to rise) into a murky teal view with muffled sound and a breath meter. Argonians breathe water; everyone else starts drowning after 20–40 seconds.
- **Animation:** people and creatures blink, glance around, shift their weight and fidget. Their feet meet slopes (the uphill leg bends), and four-legged creatures pitch and roll with the ground. Humanoids vary their attacks between overhead, sweeping and thrusting blows, flinch when hit, and collapse when they die: their knees buckle, then they topple and settle.
- **Faces:** townsfolk get varied noses, jaws, chins, brows and cheekbones, plus war paint, scars, mustaches and beards. Talking to someone moves the camera into a close-up of their face, and their mouth and hands move as they speak.
- **Weather:** thunderstorms with lightning that lights up the land, snow and blizzards on the northern isle, and the sky reddens under a blight storm.
- **Dungeons:** sculpted cave rock with stalactites; built dungeons have trims, corner pillars, ceiling beams, pipes or ribs, and hanging lanterns. Props, chests and doorways are all textured.

| | Low | Medium | High |
| --- | --- | --- | --- |
| Texture size | 256 | 512 | 1024 |
| Terrain grid | 320² | 640² | 960² |
| Shadows | off | 2048 | 4096 |
| Grass carpet | off | yes | dense |
| Bloom and light shafts | off | yes | yes |
| Ambient occlusion | off | off | yes |

The world is generated in a background worker, and the island is built step by step behind a progress bar. Distant trees and parasols switch to simpler models, and far-off characters and creatures switch to a single merged model. This cuts the triangle count by about two thirds with no visible change.

## Sound

All sound is synthesized in the browser with WebAudio. There are no audio files.

- **Adaptive score.** Layered music (pad, lead, colour, bass, war drums, choir) is generated phrase by phrase. Each region, town, dungeon type, night, combat and boss fight has its own mode, tempo and instruments, such as flutes in the Grazelands, a low drone in the Ashlands, bells in Dwemer ruins and choir in tombs. The layers crossfade as the situation changes. An original main theme plays on the title screen and is quoted in the score, with short cues for level-ups, discoveries, victory and death.
- **Ambience.** Wind and ash grit, rain, surf near the coast, lava, birds by day, crickets at night, town murmur and a distant smithy, cave drips, Dwemer machinery and steam, Daedric chanting, and the heartbeat of the Citadel. Torches crackle where they hang.
- **Effects.** Positional 3D sound, voices for every creature (idle, alert, pain, death), footsteps that change with the surface and armour weight, weapon impacts per material, a sound for each spell element, block, miss and wind-up sounds, and interface clicks.

## What's generated

- **The island.** A seeded 1.8 km heightmap with Red Mountain and its crater, surrounded by seven regions arranged at random: Ashlands, West Gash, Bitter Coast, Ascadian Isles, Grazelands, Azura's Coast and Molag Amur (with lava fields). Each region has its own palette, flora (emperor parasols, swamp trees, dead trees, grass and rocks), weather (ash storms, blight storms, rain, fog) and creatures. There's a day/night cycle, and the moons Masser and Secunda rise at night.
- **The frozen isle.** Across a strait to the north lies a snowy island of pines, with its own creatures (wolves, snow bears, rieklings, ice wraiths, draugr), Nordic barrows, and a Nord village whose elder asks you to recover the Horn of the Ancestors from a barrow. A boat from the mainland docks will take you there, or you can swim.
- **Towns.** Eight settlements with generated names, built in the Imperial, Redoran, Hlaalu, Telvanni or Ashlander style, plus the Nord village. They contain temples, guild halls, Great House councils, traders, smiths, guards and townsfolk, plus a silt strider port for fast travel.
- **Interiors.** Walk through the door of any shop, guild hall, temple or home and a furnished room is generated for it: counters and shelves for traders, a forge for smiths, altars and pews in temples, bookshelves in the Mages Guild, beds and tables in homes. Shopkeepers and guild members wait inside, and townsfolk live in the houses.
- **Roads and travel.** Roads are routed across the terrain between towns, with signposts at the forks. Boats sail between coastal docks, the Mages Guild guides teleport you between guild halls, and Dwemer-era propylon chambers link to one another once you have found them.
- **Landmarks.** Velothi towers, shipwrecks on the shore, bandit strongholds that restock with new bandits, propylon chambers, Dwemer ruins, sunken wrecks and giant clams with pearls on the sea floor, and the Ghostfence ringing Red Mountain.
- **Dungeons.** Twenty-five sites of five kinds (caves, ancestral tombs, Dwemer ruins, Daedric shrines and Nordic barrows). Caves use cellular automata; the rest use rooms and corridors. Each has one to three levels, with themed monsters, props, locked chests, loot tiers and a named boss on the bottom level. Levels have rooms at different heights joined by ramps, flooded or lava-filled low ground, pressure-plate dart and gas traps, secret closets behind loose walls, and vaults behind a gate worked by a three-lever puzzle.
- **World events.** Bandits ambush caravans on the road, the Sixth House raids towns at night, and merchants and pilgrims walk between towns. Blight storms bring tougher, diseased creatures.
- **NPCs, loot and quests.** Names come from race-specific syllable tables. Weapons and armor are built from materials running from iron to daedric, with random enchantments. Guild duties are generated: clear a dungeon, bounties, retrieve an artifact, cull creatures, or deliver a package. Rumors reveal dungeons on your map.

## Morrowind systems

- **Character creation.** 10 races, 14 classes and 13 birthsigns, each with the attributes, skill bonuses, resistances, powers and magicka modifiers you'd expect.
- **Skills improve through use** (25 skills, including Armorer). Every 10 increases in major or minor skills earns a level when you rest. Attribute multipliers (×2 to ×5) depend on which skills you trained.
- **Combat.** Hit chance comes from skill, agility, luck and fatigue, so misses happen, as in the original. Armor rating and armor skills, block with a shield, sneak attacks for triple damage, and falling damage. Each melee weapon has chop, slash and thrust damage (spears reward thrusting, axes chopping). Heavy blows stagger enemies, and enemies wind up visibly before they strike, so you can step out of reach. Hits throw sparks, blood, ichor, bone dust, wisps or ash depending on what you hit.
- **Arsenal.** 27 weapon types, including wakizashi, dai-katana, saber, scimitar, staff, spiked club and long spear. There are bows with arrows, crossbows with bolts, and stacking darts, throwing knives and stars. Ten materials run from iron through orcish and adamantium to daedric. Fire, frost, shock and poison ammunition is available, arrows and thrown weapons can be taken back from bodies, and blade poisons (venom, bile, paralytic, Marrow-Rot) coat your weapon for a few strikes.
- **Durability and the Armorer skill.** Weapons and armour wear down with use. Damage and armour rating fall with condition, and broken gear comes off and can't be used until it's repaired. Repair it with armorer's hammers and tongs (the Armorer skill levels by use) or pay a smith.
- **Legendary artifacts.** Fourteen named artifacts with lore and unique effects, such as Mehrunes' Razor, Goldbrand, Umbra, the Ice Blade of the Monarch, Ebony Mail and the Boots of Blinding Speed. Every Daedric shrine's master carries one, and a few other strong dungeon bosses guard the rest.
- **Magic.** Destruction, Restoration, Alteration, Illusion, Mysticism and Conjuration spells, including bound weapons, Divine and Almsivi Intervention, Detect Creature, Open Lock, Calm and Paralyze. Racial and birthsign powers can be used once a day. Spell success chance applies.
- **Factions.** Fighters, Mages and Thieves Guilds, the Temple, the Imperial Legion, the Morag Tong, and Houses Redoran, Hlaalu and Telvanni (you may join only one House). Ten ranks each, gated on reputation and favored skills.
- **Dialogue.** Disposition, persuasion (admire, intimidate, bribe), barter priced by mercantile skill, training (five sessions per level), spell merchants, temple healing, repairs at the smith, and travel by silt strider, boat or Mages Guild guide.

## Main quest

A Blades contact waits in your starting town. They send you after Kagrenac's tools (Sunder, Keening and Wraithguard), each held by the boss of a different stronghold. With all three in hand, the ward on the Citadel in Red Mountain's crater opens. Descend and kill the Dagoth lord to win. Your score counts levels, kills, dungeons, quests, relics, gold and days survived, and past runs are listed on the title screen.

## Code layout

```
src/core/     seeded RNG and Perlin noise
src/data/     races, classes, birthsigns, skills, spells, items, creatures, factions, name tables
src/logic/    pure, testable generation and rules (world, dungeons, character, combat, items, quests)
src/render/   Three.js builders: terrain, flora, buildings, creatures, dungeons, sky, first-person view
src/game/     runtime: game loop, areas, actors and AI, player controller, dialogue services, audio, input
src/ui/       HUD, menus, dialogue, character creation, title/death/victory screens, touch controls
public/       app manifest, icons and the offline service worker
tests/        node:test suites for the logic layer
```

All art and audio are procedural. There are no asset files apart from the app icons.
