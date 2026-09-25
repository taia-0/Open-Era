# UI and art direction

## Visual target

The game uses a bright, minimalist, tooney maritime style with warm illustrated panels over a turquoise world map. The current mockups are portrait mobile concepts at 940×1672; they establish hierarchy and mood rather than exact production layouts.

Primary visual ingredients:

- Turquoise and cyan sea fields.
- Warm ivory panels and cards.
- Deep navy type and outlines.
- Teal primary actions, with gold for emphasis and progression.
- Rounded cards, restrained shadows, and large touch targets.
- Small illustrated islands and ships rather than a sea filled with decorative objects.

## World map

At normal zoom, show a small region with approximately two to four islands. Island and region names remain visible. Most details appear only after selecting an island, ship, or party.

The sea's meaningful objects are islands and ships. Decorative waves, birds, monsters, ruins, and other props should be sparse and must not read as interactable unless they actually are.

Header priorities:

- Money.
- Essential strategic resources.
- Compact account/navigation menu at top right.

Footer priorities:

- Current ship and crew condition.
- Active orders.
- An exception-first check-in briefing for attacks, shortages, refusals, deviations, completion reports, and stale intelligence.
- Informational exceptions may be acknowledged and hidden. Unresolved decisions remain visible, while an appointed reporting officer compresses routine notices into a digest.
- Travel progress.
- A small set of context-sensitive actions.

The large “The Crossing” command panel shown in early mockups is superseded. The map itself is the primary interaction surface.

## Selection and inspection

Selecting an island opens an inspection panel emphasizing:

- Resource and production statistics.
- Colonization and population statistics.
- Defense, fortification, garrison, and threat statistics.
- Parties currently known to be present.
- Trade, travel, exploration, or political actions that are actually available.

Owned assets show exact values. Foreign assets show the source, age, confidence, and estimated values of current intelligence. Unknown data must display as unknown—not zero.

Selecting a ship or party emphasizes condition, crew, troop groups, supplies, destination, and active orders.

Before a hostile action, the island panel shows one compact combat forecast rather than a wall of raw statistics. It combines likely outcome and casualties, character-versus-troop power balance, and retreat/capture exposure. Estimate ranges and disclosed factors reflect the commander's strategy and current intelligence.

During a major battle, the normal action panel becomes a phase report. It shows losses, remaining forces, health, morale, and updated retreat/capture risk. Accelerated time stops at the report; the player may continue by advancing one phase or retreat immediately. No other tactical controls appear after commitment.

## Character art

Named characters should consistently use a chibi-anime design viewed from a three-quarter top-down angle. The same construction applies in party cards, messages, inspection panels, and battle summaries. Full-size conventional portraits in early concepts are retained only as iteration history.

Troops and sailors should be visually simpler than named characters. Their silhouettes and equipment communicate branch and tier without competing for character-level attention.

## Party screen

The party screen separates:

- Named characters and their specialist roles.
- Dedicated ship crew and capacity.
- Troop groups, counts, experience, discipline, rarity distribution, and promotion readiness.
- Supplies, morale, health, and active standing orders.

Named characters use the chibi three-quarter top-down treatment. Troop promotion opens a separate focused panel rather than expanding every tree inline.

## Communications

Early local-conversation concepts used selectable responses. If structured responses are ever used, they belong in a grid and must not include decorative neighboring icons.

The current direction supersedes local conversation screens with persistent communications:

- Inbox tabs for all, direct, group, and request threads.
- Free-form composer.
- Clear delivery time and pending-reply indication.
- Participant identity and current thread context.
- Compact cards for proposals, agreements, debts, reports, and other structured attachments.

Character appearance in message threads still follows the chibi three-quarter top-down rule, even though one generated DM concept retains an earlier portrait crop.

## Screen inventory

| Surface | Purpose | Mockup status |
| --- | --- | --- |
| Regional map | Primary navigation and world awareness | Current direction |
| Island selected | Context actions and travel | Current direction |
| Ship selected | Condition, cargo, crew, orders | Current direction |
| Island inspection | Resource, colonization, and defense intelligence | Current direction |
| Combat forecast | Pre-commitment risk and expected losses | Prototype direction |
| Battle phase report | Continue-or-retreat decision window | Prototype direction |
| Party overview | Named crew, sailors, troops | Chibi variant is current |
| Troop training | Promotion and branch choices | Current direction |
| Message inbox | Persistent communication overview | Current direction |
| Direct-message thread | Free-form negotiation and attachments | Current direction |
| Choice-list conversation | Legacy local dialogue | Superseded |
| Choice-grid conversation | Legacy restyle reference | Superseded by free-form chat |
| “The Crossing” panel | Early map command panel | Superseded |

## Asset policy

Generated mockups are vision references, not shippable UI or final art. They contain placeholder names, quantities, icons, and layouts that may contradict simulation rules. Production assets should be recreated from an explicit design system, stored with provenance and licensing notes, and reviewed for consistency with the original-world requirement.
