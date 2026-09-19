# Kempf's Simple Decision Helper

A visual decision-mapping plugin for [Obsidian](https://obsidian.md/).

Kempf's Simple Decision Helper turns a difficult choice into a clear map of options, benefits, drawbacks, and sub-options. It calculates consistent comparison scores without turning the decision into a complicated spreadsheet.

The plugin is deliberately simple to operate: build the map, rate what matters, and compare the available paths.

## What it does

- Gives every decision its own `.ksdh` file inside your vault.
- Arranges the decision automatically in a clean visual tree.
- Compares any number of top-level options.
- Supports sub-options that represent either alternative paths or parts of one combined plan.
- Rates benefits and drawbacks using two understandable 1–5 scales.
- Clearly marks deal-breakers that disqualify an option.
- Shows the current recommendation, ties, incomplete options, and sensitive results.
- Supports mouse, keyboard, and touchscreen navigation.
- Exports readable Markdown reports, JSON backups, SVG, JPG, and PDF.
- Works locally without AI, accounts, analytics, or external services.

## Quick start

1. Create a new decision from the ribbon icon or command palette.
2. Write the question you need to answer.
3. Add each realistic choice as an **Option**.
4. Add **Benefits** and **Drawbacks** beneath each option.
5. Rate each factor for **Likelihood** and **Impact**, from 1 to 5.
6. Compare the options in the Decision Summary.

The score supports your judgment; it does not replace it.

## The scoring model

Every benefit and drawback receives a factor score:

```text
Factor score = Likelihood × Impact
```

Each factor therefore contributes between 1 and 25 points.

An option's normalized score is:

```text
Option score = ((Total benefits − Total drawbacks) ÷ (Rated factors × 25)) × 100
```

Scores range from −100 to +100:

| Score | Plain-language meaning |
|---:|---|
| +20 to +100 | Favorable |
| +5 to +19 | Slightly favorable |
| −4 to +4 | Balanced |
| −19 to −5 | Slightly unfavorable |
| −100 to −20 | Unfavorable |

Because the score is normalized, adding more factors does not automatically improve or damage an option. What matters is the balance and strength of the rated evidence.

The main Decision score is the score of the strongest eligible top-level option.

## Sub-options

An Option with child Options can use one of two modes:

- **Single Path:** the child options are alternatives. The strongest eligible path represents that branch.
- **All Paths:** every child option is part of the same plan. Their benefits and drawbacks are combined.

The mode appears directly on an Option node that contains sub-options.

## Deal-breakers

A drawback can be marked as a **Deal-breaker** when it makes an option unacceptable regardless of its numerical score. A blocked option remains visible, but it cannot become the recommendation.

Use this only for a genuine hard limit, such as an unaffordable cost, legal restriction, safety requirement, or unavailable resource.

## Controls

| Action | Control |
|---|---|
| Select a node | Click or tap it |
| Edit a node | Double-click it or select it and press `Enter` |
| Add an Option | Select a Decision or Option and press `Tab` |
| Add a Benefit | Select an Option and press `B` |
| Add a Drawback | Select an Option and press `D` |
| Move through the tree | Arrow keys |
| Delete a branch | Select it and press `Delete` |
| Pan | Drag the background with the left or middle mouse button |
| Zoom | Mouse wheel, toolbar buttons, or two-finger pinch |
| Open menus | Right-click, or press and hold on a touchscreen |
| Undo | `Ctrl/Cmd+Z` |
| Redo | `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` |

Branches can also be moved by dragging them onto a valid Decision or Option node. Complete branches can be copied and pasted from the node menu.

## Files, backups, and reports

- `.ksdh` is the editable decision-map file stored in the vault.
- JSON is the exact backup format and the only format that can be imported.
- Markdown creates a readable decision report. It is not a restorable backup.
- SVG and JPG create shareable images.
- PDF creates a printable one-page overview.

## Installation

### Community Plugins

Once available in the Obsidian Community Plugins directory:

1. Open **Settings → Community plugins**.
2. Select **Browse**.
3. Search for **Kempf's Simple Decision Helper**.
4. Select **Install**, then **Enable**.

### Manual installation

1. Download `main.js`, `manifest.json`, and `styles.css` from the matching GitHub release.
2. Create this folder inside the vault:

```text
.obsidian/plugins/kempfs-simple-decision-helper/
```

3. Place the three files in that folder.
4. Restart Obsidian.
5. Enable the plugin under **Settings → Community plugins**.

## Privacy

Kempf's Simple Decision Helper works entirely inside Obsidian. It does not use artificial intelligence, connect to external services, collect analytics, or transmit decision data.

## Limitations

- A score reflects the information and ratings supplied by the user; it cannot guarantee the correct decision.
- Factors that are difficult to predict may deserve further research before rating.
- Extremely large image exports may be limited by the device's available memory.
- JSON backups should be stored safely when a decision is important.

## Documentation

See [HELP.md](HELP.md) for the full plain-language guide.

## License

Released under the [MIT License](LICENSE).

