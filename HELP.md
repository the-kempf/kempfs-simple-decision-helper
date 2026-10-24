# The Kempf Simple Decision Helper — User Guide

## What this plugin is for

This plugin helps you compare choices when a decision has several benefits, risks, or possible paths.

It does three jobs:

1. It places the information into a visual tree.
2. It uses one consistent calculation for every option.
3. It shows which option currently has the strongest balance of benefits over risks.

The plugin does not make the decision for you. It makes your reasoning easier to see and compare.

## Starting a decision

Choose a starting template and select **Preview** to inspect its complete Decision, Option, Benefit, and Risk structure before creating the file. The available templates are **Blank**, **Simple Choice**, **Buy or Keep**, **Education/Training**, **Home Improvement**, **Event Planning**, **Travel Planning**, and **Pros and Cons**. Every generated node is editable or removable.

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

### Risk

A cost, problem, disadvantage, or unwanted result that may come from an Option.

Examples:

- Expensive parking
- Unreliable schedule
- Longer walk

Benefits and Risks are final scoring factors. They cannot contain child nodes.

## Building a useful decision

Start small:

1. Write one clear Decision question.
2. Add the choices you could realistically make.
3. Add the most important Benefits and Risks for each choice.
4. Rate the factors using the same standard across every Option.
5. Look at the recommendation and warnings.
6. Add missing information or adjust ratings only when you have a real reason.

You do not need to list every imaginable detail. Include the factors that could actually affect the choice.

## Rating a factor

Every Benefit and Risk uses two ratings.

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

A Risk with Likelihood 2 and Impact 5 scores:

```text
2 × 5 = 10 risk points
```

## Recording supporting evidence

Every Benefit and Risk can store optional supporting information:

- **Supporting notes** is a multiline field for reasoning, observations, and facts.

A paperclip on a factor node means supporting notes are attached. Select the node and open **Selected node details** to read them. Notes are preserved in Markdown reports and JSON backups, but they do not change the numerical score.

## How an Option is scored

The plugin adds the Benefit scores, subtracts the Risk scores, and normalizes the result:

```text
Option score = ((Total benefits − Total risks) ÷ (Rated factors × 25)) × 100
```

This creates a fair scale from −100 to +100 even when Options contain different numbers of factors.

| Score | Meaning |
|---:|---|
| +20 to +100 | Favorable |
| +5 to +19 | Slightly favorable |
| −4 to +4 | Balanced |
| −19 to −5 | Slightly unfavorable |
| −100 to −20 | Unfavorable |

A negative score does not mean the Option is forbidden. It means the rated risks currently outweigh the rated benefits.

An Option with no Benefits or Risks is marked **Not evaluated**. It is shown in the map but excluded from the recommendation.

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

Every All Paths child is required. If one has no rated Benefits or Risks, the plugin names it as an unevaluated required path and warns that it was excluded from the numerical score. The available score remains visible, but the plan should not be treated as completely assessed.

## Deal-breakers

Mark a Risk as a **Deal-breaker** only when it makes the entire Option path unacceptable regardless of its score.

Examples include:

- The Option exceeds a firm budget limit.
- A required resource is unavailable.
- The Option violates a law, policy, or safety requirement.
- The Option cannot meet a fixed deadline.

A blocked Option stays visible so you can understand why it was rejected, but it cannot become the recommendation.

## Understanding warnings

### Not evaluated

One or more Options have no rated factors. They are excluded from the recommendation until information is added.

### All Paths incomplete

One or more required sub-options in an All Paths plan have no rated factors. The plugin names the missing paths and excludes them from the numerical score until they are evaluated.

### Limited evidence

An Option is based on fewer than two factors. Its score is valid, but it may rest on too little information.

### Sensitive result

A one-point change to a rating could change the leading Option. The decision is close and deserves another look.

### Blocked by a deal-breaker

The Option contains a Risk marked as a Deal-breaker and cannot be recommended.

Hover over a warning to see which Options or factors caused it.

## Mouse and touchscreen controls

Choose **Change layout…** to open the visual layout picker. Select **Standard**, **Staggered**, or **Linear**, choose the direction, inspect the preview, and select **Apply**. Staggered runs options along a trunk and alternates their branches on opposite sides. Linear supports sequences moving Up, Down, Left, or Right, with branches extending along the other axis. Down and Right is the original Linear arrangement. Deeper levels remain indented, and branch colors identify Options, Benefits, and Risks.

In the Decision summary, use the pin beside **Selected node** to keep that node's information visible while selecting other nodes. Use the chevron to collapse or expand the node information; the collapsed state is remembered with the decision.

- Click or tap a node to select it.
- Double-click a node to edit it.
- Drag empty background with the left or middle mouse button to pan.
- The canvas extends far beyond the decision in every direction, allowing long, uninterrupted panning.
- Use the mouse wheel to zoom from 5% to 200%.
- Pinch with two fingers to zoom from 5% to 200% on a touchscreen.
- Right-click a node or press and hold it to open its menu.
- Drag a branch onto a valid Decision or Option node to move it.
- Select the minus or numbered badge in a parent node's upper-right corner to collapse or expand its descendants.
- Open a node's menu and choose **Focus branch** to hide unrelated branches. Choose **Unfocus** in the toolbar or background menu to restore the complete map.
- Choose **Fit decision** to center and fit all currently visible nodes.
- Choose **Search nodes** or press `Ctrl/Cmd+F` to search node titles. Enter moves to the next match, Shift+Enter moves to the previous match, and Escape closes search.
- Click empty background to clear the selection.

The toolbar provides New Decision, Undo, Redo, Zoom Out, Zoom In, Fit Decision, Search Nodes, Decision Options, and Help.

## Keyboard controls

| Key | Action |
|---|---|
| Arrow keys | Move through the visible tree |
| `Enter` or `Tab` | Add a connected item beneath the selected Decision or Option |
| `F2` | Edit the selected node |
| `B` | Add a Benefit beneath a selected Option |
| `D` | Add a Risk beneath a selected Option |
| `Space` | Collapse or expand the selected parent node |
| `Delete` | Delete the selected branch |
| `Ctrl/Cmd+Z` | Undo |
| `Ctrl/Cmd+Shift+Z` or `Ctrl/Cmd+Y` | Redo |
| `Ctrl/Cmd+F` | Search node titles |

Inside the node editor, `Enter` saves the single-line node title. Put longer explanations in **Supporting notes** on Benefits and Risks.

## Collapsing branches

Use the minus or numbered badge in a parent node's upper-right corner to collapse or expand its descendants. Collapsed descendants remain part of the decision and continue to affect scores, recommendations, warnings, Markdown reports, and JSON backups. SVG, JPG, and PDF exports show the same compact branch view that is currently visible on the map.

The node and background menus include **Collapse and expand**. A node menu can collapse the map to that selected node's level. The background menu opens a level chooser that starts at level 1. You can also collapse or expand immediate children, expand an entire branch, collapse the entire map, or expand the entire map.

Collapse and expand commands are dimmed when choosing them would not change the current map.

The collapsed state is saved in the decision file and restored when you reopen it.

In **Decision options**, use **Dim unselected branches** to enable branch fading and **Dim strength** to choose how faint unrelated branches become. The range is 0–90%, in 5% steps.

## Focusing a branch

Choose **Focus branch** from a non-Decision node's menu to keep that node, all of its visible descendants, and its path back to the Decision on screen. Other branches are temporarily hidden without changing their nodes, scores, positions, or collapsed state.

The toolbar shows the focused node and the number of hidden nodes. Choose **Unfocus** there or from the background menu to restore the complete map. SVG, JPG, and PDF exports match the currently focused view.

## Moving, copying, and deleting branches

Right-click or press and hold a node to open its menu.

- **Move branch to…** moves the node and everything beneath it.
- **Copy branch** copies the entire branch.
- **Paste** duplicates that branch beneath another valid node.
- **Delete this branch** removes the node and everything beneath it.
- **Lock branch** protects the node and every descendant from editing, moving, pasting, or deletion. A lock symbol marks protected nodes. Choose **Unlock branch** on any protected descendant to unlock the ancestor that owns the lock.

The plugin prevents invalid structures. For example, a Benefit or Risk cannot contain another node.

## Layout and appearance

Right-click or press and hold the background and choose **Change layout…** to open the preview window. The available layout families are:

- **Standard:** Top-facing, Bottom-facing, Left-facing, and Right-facing.
- **Staggered:** Up, Down, Left, and Right trunks with alternating branches.
- **Linear:** Up or Down sequences with Left or Right branches, and Left or Right sequences with Up or Down branches.

Select a layout to preview it. Choose **Apply** to use it or **Cancel** to leave the current decision unchanged.

The background menu also offers:

- Obsidian Default
- Dark
- Paper

The toolbar's Decision Options window controls layout, warnings, score labels, dimming of unselected branches, sibling spacing, and level spacing for the current map. When dimming is enabled and a non-root node is selected, its path to the Decision and all of its descendants remain clear while unrelated branches fade.

Global plugin settings control the defaults used by new decisions, including background, layout, and deletion confirmation. New decisions begin at 100% zoom; each decision remembers its own zoom afterward. Newly created Options begin in **Single Path** mode, which you can change for each Option when needed. The **New decision folder** section lets you choose an existing vault folder or create and immediately use a new nested folder.

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
- Presentation PDF creates a compact Letter-size decision brief containing the recommendation, comparison chart, important warning, strongest benefits, greatest risks, and leading option snapshots. If the content cannot fit cleanly, complete comparison rows or sections continue on numbered pages. Use the preview's minus and plus controls to inspect each page from 50% to 200%; select the percentage to return to 100%. Then choose **Save PDF** to open the system save dialog or **Cancel** to discard it.

## Practical advice

- Compare realistic Options, not vague ideas.
- Use the same meaning for each 1–5 rating throughout the map.
- Avoid changing ratings merely to produce the result you want.
- Treat a close or sensitive result as a reason to gather more information.
- Use Deal-breakers only for genuine hard limits.
- Export a JSON backup before making major changes to an important decision.

## Privacy

The Kempf Simple Decision Helper works entirely inside Obsidian. It does not use artificial intelligence, connect to external services, collect analytics, or transmit decision data.
