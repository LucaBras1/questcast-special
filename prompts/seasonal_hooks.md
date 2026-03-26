# Seasonal and Thematic Prompt Hooks -- Phase 2 Preparation

## Status: Documentation only. No implementation for MVP.
## Target: Phase 2 (Adventure Pass system)

---

## Overview

Questcast Phase 2 introduces an Adventure Pass system with rotating seasonal themes. Each theme modifies the game experience through prompt injection without changing core game mechanics. This document defines how themes will be integrated into the prompt system.

---

## Theme Injection Mechanism

### Variable: `{seasonal_theme}`

A new variable injected into the base system prompt. In MVP, this variable is empty or omitted. In Phase 2, the backend sets it based on the active Adventure Pass theme.

### Injection Point

Add a new section to the base system prompt, after `<rules>` and before `<edge_cases>`:

```
<seasonal_theme>
{seasonal_theme}
</seasonal_theme>
```

When `{seasonal_theme}` is empty, the AI ignores the empty tags. When populated, the AI adapts narration, enemies, and atmosphere accordingly.

### Theme Data Structure

```json
{
  "theme_id": "haunted_autumn",
  "display_name": "Haunted Autumn",
  "display_name_cs": "Proklety podzim",
  "active_from": "2026-10-01",
  "active_to": "2026-11-15",
  "prompt_injection": "The world is deep in autumn. Leaves fall in shades of crimson and gold. Nights come early and the veil between worlds grows thin. Spirits wander the roads after dark. Jack-o-lanterns glow on porches and in windows. Every shadow might hide something watching. Modify your narration to reflect this autumn atmosphere. Enemies may include restless spirits, harvest golems, and shadow hounds. Locations have autumn decorations, fallen leaves, harvest festivals, and eerie fog.",
  "prompt_injection_cs": "Svet je hluboko na podzim. Listi pada v odstinech karminu a zlata. Noci prichazeji brzy a clona mezi svety je tencí. Duchove bloudí po cestach po setmeni. Dynovite lucerny sviti na verandach a v oknech. Kazdy stin muze skryvat neco, co vas pozoruje. Upravte sve vypraveni tak, aby odrázelo tuto podzimni atmosferu. Nepratele mohou zahrnovat nepokojne duchy, znove golemy a stinove chrty. Lokace maji podzimni vyzdobu, spadane listi, doznkove slavnosti a prizracnou mlhu.",
  "image_style_modifier": "autumn atmosphere, falling red and gold leaves, harvest decorations, eerie fog, jack-o-lanterns, thin veil between worlds",
  "enemy_pool_additions": ["Restless Spirit", "Harvest Golem", "Shadow Hound", "Will-o-the-Wisp", "Scarecrow Sentinel"],
  "location_modifiers": {
    "tavern_interior": "decorated with dried herbs and candles, pumpkins on tables, warm cider instead of ale",
    "dark_forest": "carpeted in crimson leaves, bare branches reaching like skeletal fingers, distant howling",
    "village_square": "harvest festival preparations, apple barrels, corn sheaves, children in masks"
  }
}
```

---

## Planned Adventure Pass Themes

### 1. Haunted Autumn (October-November)

**Atmosphere modifiers:**
- Opening narration: Wind carries the scent of dying leaves and wood smoke. The harvest moon hangs low and orange.
- Enemy types: Restless spirits, harvest golems, shadow hounds, will-o-the-wisps, scarecrow sentinels.
- Locations gain: Fallen leaves, bare branches, jack-o-lanterns, harvest decorations, eerie fog.
- Time of day bias: Evening and night encounters more frequent.
- Threat tone: Supernatural unease, things watching from shadows, spirits with unfinished business.

**Image style modifier:**
Autumn color palette of crimson, amber, and burnt orange. Bare tree silhouettes. Fog. Harvest moon. Jack-o-lantern light mixed with standard torch-lit ambiance.

### 2. Frozen North (December-January)

**Atmosphere modifiers:**
- Opening narration: Snow blankets the world in silence. Your breath crystallizes in the air. The northern lights shimmer on the horizon.
- Enemy types: Ice wraith, frost giant, winter wolf, frozen revenant, blizzard elemental.
- Locations gain: Snow-covered rooftops, frozen rivers, ice crystals on windows, warm hearth fires as contrast.
- Time of day bias: Short days, long nights. Dawn and dusk are brief and vivid.
- Threat tone: Isolation, cold as a constant enemy, survival elements, the beauty and danger of winter.

**Image style modifier:**
Cool blue-white palette with warm amber firelight contrast. Snow, ice, northern lights. Frost patterns. Breath visible in cold air.

### 3. Desert Sands (February-March)

**Atmosphere modifiers:**
- Opening narration: The sun beats down mercilessly. Sand stretches to every horizon, broken only by the shimmer of heat mirages. Ancient ruins peek from the dunes.
- Enemy types: Sand serpent, dust devil elemental, mummy guardian, scorpion swarm, desert bandit.
- Locations gain: Sandstone architecture, oasis towns, bazaars with colorful canopies, buried temples, mirages.
- Time of day bias: Travel at dawn and dusk. Midday is dangerous. Night is cold and clear.
- Threat tone: Heat exhaustion, water scarcity, buried secrets, ancient civilizations, deceptive beauty.

**Image style modifier:**
Warm sand and gold palette with deep blue sky. Heat shimmer. Sandstone ruins. Dramatic shadows from harsh sun. Starlit desert nights.

### 4. Storm Season (April-May)

**Atmosphere modifiers:**
- Opening narration: Thunder rolls across the darkened sky. Rain lashes the landscape. Lightning illuminates brief, terrifying glimpses of the world.
- Enemy types: Storm elemental, lightning drake, flooded dungeon creatures, thunder beast, corrupted druid.
- Locations gain: Flooded paths, lightning-struck trees, waterfalls, rain-soaked villages, dramatic cloudscapes.
- Time of day bias: Overcast days, dramatic storm breaks, rainbow moments of calm.
- Threat tone: Raw elemental power, nature's fury, dramatic weather as both obstacle and spectacle.

**Image style modifier:**
Dark stormy skies with lightning illumination. Rain and mist. Dramatic cloud formations. Moments of rainbow light breaking through.

### 5. Verdant Bloom (June-July)

**Atmosphere modifiers:**
- Opening narration: The world explodes with life. Every surface sprouts green. Flowers carpet the meadows and magic hums in the warm summer air.
- Enemy types: Corrupted treant, carnivorous plant, fey trickster, swamp troll, giant insect.
- Locations gain: Overgrown ruins, fairy rings, enchanted glades, flower markets, druidic circles.
- Time of day bias: Long golden days, warm twilight, bioluminescent nights.
- Threat tone: Nature as both beautiful and dangerous, fey mischief, the wild reclaiming civilization.

**Image style modifier:**
Rich greens and flower colors. Dappled sunlight. Bioluminescence. Overgrown architecture. Warm golden hour.

### 6. Shadow Festival (August-September)

**Atmosphere modifiers:**
- Opening narration: Colored lanterns sway above the streets. Masked figures dance in the squares. Behind the revelry, something darker moves.
- Enemy types: Masked assassin, carnival mimic, shadow puppeteer, illusionist mage, doppelganger.
- Locations gain: Festival decorations, mask shops, fortune teller tents, fireworks, secret underground passages.
- Time of day bias: Evening festivities, midnight secrets, morning aftermath.
- Threat tone: Deception, hidden identities, nothing is as it seems, intrigue behind the celebration.

**Image style modifier:**
Colorful lanterns and festival lights against dark backgrounds. Masks and costumes. Rich purples and golds amplified. Mysterious and festive.

---

## How Theme Modifies Each Prompt Component

| Component | Modification Method |
|---|---|
| System prompt narration style | `{seasonal_theme}` text injection adds atmosphere guidance |
| Opening narration | Theme-specific opening lines provided in theme data |
| Enemy types | Theme adds to enemy pool; base enemies remain available |
| Scene descriptions | `{seasonal_theme}` guides environmental details; location_modifiers provide specifics |
| NPC dialogue | NPCs reference the season naturally ("Terrible storms this season") |
| Image generation | `image_style_modifier` appended to DALL-E prompt |
| Atmospheric transitions | Theme-specific one-liners added to atmosphere.txt pool |
| Fallback responses | No change (season-neutral) |

---

## Backend Integration Notes (for Phase 2)

1. Store active theme in user session or global config.
2. Load theme data from database or config file.
3. During prompt assembly, if theme is active:
   - Inject `prompt_injection` (or `prompt_injection_cs`) as `{seasonal_theme}`.
   - Append `image_style_modifier` to all DALL-E prompts.
   - Include theme enemy pool in combat encounter generation.
   - Apply location modifiers when scene_description sub-prompt fires.
4. Theme transitions should be seamless: no "the season changed" notification, just gradual atmosphere shift.

---

## Revenue Model (Phase 2)

- Base game: No seasonal theme (standard fantasy).
- Adventure Pass: Unlocks seasonal themes + exclusive theme-specific quests.
- Themes rotate on a 6-week cycle.
- Previous themes can be replayed with Adventure Pass.
- Theme-specific achievements and collectibles.
