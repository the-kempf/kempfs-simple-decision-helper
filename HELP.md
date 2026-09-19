# Simple Decision Helper — User Guide

## What this plugin is for

This plugin helps you compare choices when a decision has several benefits, drawbacks, or possible paths.

It does three jobs:

1. It places the information into a visual tree.
2. It uses one consistent calculation for every option.
3. It shows which option currently has the strongest balance of benefits over drawbacks.

The plugin does not make the decision for you. It makes your reasoning easier to see and compare.

## The four parts of a map

### Decision

The main question you are trying to answer. A map has exactly one Decision node.

Good example:

> Which transportation option should I use for my commute?

### Option

A realistic choice or course of action.

Examples:

- Drive
- Take the train
- Use the bus

Options can contain smaller Options when a choice has several versions or steps.

### Benefit

A positive result that may come from an Option.

Examples:

- Shorter travel time
- Lower cost
- More flexibility

### Drawback

A cost, problem, disadvantage, or unwanted result that may come from an Option.

Examples:

- Expensive parking
- Unreliable schedule
- Longer walk

Benefits and Drawbacks are final scoring factors. They cannot contain child nodes.

## Building a useful decision

Start small:

1. Write one clear Decision question.
2. Add the choices you could realistically make.
3. Add the most important Benefits and Drawbacks for each choice.
4. Rate the factors using the same standard across every Option.
5. Look at the recommendation and warnings.
6. Add missing information or adjust ratings only when you have a real reason.

You do not need to list every imaginable detail. Include the factors that could actually affect the choice.

## Rating a factor

Every Benefit and Drawback uses two ratings.

### Likelihood

How likely is this result to happen?

| Rating | Meaning |
|---:|---|
| 1 | Very unlikely |
| 2 | Unlikely |
| 3 | Possible |
| 4 | Likely |
| 5 | Very likely |

### Impact

How much would this result matter if it happened?

| Rating | Meaning |
|---:|---|
| 1 | Very small effect |
| 2 | Small effect |
| 3 | Moderate effect |
| 4 | Large effect |
| 5 | Very large effect |

### Factor score

```text
Factor score = Likelihood × Impact
```

For example, a Benefit with Likelihood 4 and Impact 3 scores:

```text
4 × 3 = 12 benefit points
```

A Drawback with Likelihood 2 and Impact 5 scores:

```text
2 × 5 = 10 drawback points
```

## How an Option is scored

The plugin adds the Benefit scores, subtracts the Drawback scores, and normalizes the result:

```text
Option score = ((Total benefits − Total drawbacks) ÷ (Rated factors × 25)) × 100
```

This creates a fair scale from −100 to +100 even when Options contain different numbers of factors.

| Score | Meaning |
|---:|---|
| +20 to +100 | Favorable |
| +5 to +19 | Slightly favorable |
| −4 to +4 | Balanced |
| −19 to −5 | Slightly unfavorable |
| −100 to −20 | Unfavorable |

A negative score does not mean the Option is forbidden. It means the rated drawbacks currently outweigh the rated benefits.

An Option with no Benefits or Drawbacks is marked **Not evaluated**. It is shown in the map but excluded from the recommendation.

## How the main Decision is scored

```text
Decision score = Highest eligible top-level Option score
```

The Option with the highest eligible score becomes the current recommendation. If several Options share the same score, the result is shown as a tie.

The recommendation is only as useful as the information entered. Review warnings before acting.

## Single Path and All Paths

These settings matter only when an Option contains child Options.

### Single Path

Use **Single Path** when the sub-options are alternatives and you would choose only one.

Example:

```text
Travel by public transportation
├── Take the train
└── Take the bus
```

The strongest eligible child path represents the branch.

### All Paths

Use **All Paths** when every sub-option is part of one larger plan.

Example:

```text
Prepare for the exam
├── Review notes
├── Practice questions
└── Attend study group
```

The plugin combines the factors from all child paths.

## Deal-breakers

Mark a Drawback as a **Deal-breaker** only when it makes the entire Option path unacceptable regardless of its score.

Examples include:

- The Option exceeds a firm budget limit.
- A required resource is unavailable.
- The Option violates a law, policy, or safety requirement.
- The Option cannot meet a fixed deadline.

A blocked Option stays visible so you can understand why it was rejected, but it cannot become the recommendation.

## Understanding warnings

### Not evaluated

One or more Options have no rated factors. They are excluded from the recommendation until information is added.

### Limited evidence

An Option is based on fewer than two factors. Its score is valid, but it may rest on too little information.

### Sensitive result

A one-point change to a rating could change the leading Option. The decision is close and deserves another look.

### Blocked by a deal-breaker

The Option contains a Drawback marked as a Deal-breaker and cannot be recommended.

Hover over a warning to see which Options or factors caused it.

## Mouse and touchscreen controls

- Click or tap a node to select it.
- Double-click a node to edit it.
- Drag empty background with the left or middle mouse button to pan.
- Use the mouse wheel to zoom.
- Pinch with two fingers to zoom on a touchscreen.
- Right-click a node or press and hold it to open its menu.
- Drag a branch onto a valid Decision or Option node to move it.
- Click empty background to clear the selection.

The toolbar provides New Decision, Undo, Redo, Zoom Out, Zoom In, Decision Options, and Help.

## Keyboard controls

| Key | Action |
|---|---|
| Arrow keys | Move through the visible tree |
| `Enter` | Edit the selected node |
| `Tab` | Add an Option beneath a selected Decision or Option |
| `B` | Add a Benefit beneath a selected Option |
| `D` | Add a Drawback beneath a selected Option |
| `Delete` | Delete the selected branch |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` | Redo |

Inside the node editor, `Enter` saves and `Ctrl/Cmd+Enter` creates a new line.

## Moving, copying, and deleting branches

Right-click or press and hold a node to open its menu.

- **Move branch to…** moves the node and everything beneath it.
- **Copy branch** copies the entire branch.
- **Paste** duplicates that branch beneath another valid node.
- **Delete this branch** removes the node and everything beneath it.

The plugin prevents invalid structures. For example, a Benefit or Drawback cannot contain another node.

## Layout and appearance

Right-click or press and hold the background to choose:

- Bottom-facing layout
- Top-facing layout
- Right-facing layout
- Left-facing layout
- Light background
- Dark background

The toolbar's Decision Options window controls warnings, score labels, sibling spacing, and level spacing for the current map.

Global plugin settings control the defaults used by new decisions, including the save folder, background, layout, zoom, sub-option mode, and deletion confirmation.

## Files and backups

Each decision is stored as its own `.ksdh` file in the vault.

### JSON backup

JSON is the exact backup format. It is the only format the plugin can import and use to restore a decision map.

### Markdown report

Markdown creates a readable Obsidian note containing the decision, recommendation, scores, options, factors, and ratings. It is a report, not a restorable backup.

### Visual exports

- SVG is best for a sharp, scalable diagram.
- JPG is convenient for sharing.
- PDF creates a printable one-page overview.

## Practical advice

- Compare realistic Options, not vague ideas.
- Use the same meaning for each 1–5 rating throughout the map.
- Avoid changing ratings merely to produce the result you want.
- Treat a close or sensitive result as a reason to gather more information.
- Use Deal-breakers only for genuine hard limits.
- Export a JSON backup before making major changes to an important decision.

## Privacy

Kempf Simple Decision Helper works entirely inside Obsidian. It does not use artificial intelligence, connect to external services, collect analytics, or transmit decision data.
