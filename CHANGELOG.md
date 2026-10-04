# Changelog

## 0.3.49 — Beta release

- Prepared the next beta release with synchronized README, full user guide, in-app help, manifest, and compatibility metadata.
- Documented all 16 Standard, Staggered, and Linear arrangements and clarified that layout changes do not affect decision data or scores.
- Updated the Decision Options and background-menu instructions to match the visual layout picker.
- Standardized release documentation around the current branch, appearance, export, and modal behavior.

## 0.3.48 — Consistent modal actions

- Standardized modal action rows with Cancel on the left and the highlighted primary action on the right.
- Corrected the Create decision and Choose layout windows; other editing, confirmation, and export windows already followed this order.
- Kept informational previews as single-action Close windows.

## 0.3.47 — Paper focus controls

- Restored the full focused-branch status text and its original sizing.
- Corrected the focus indicator and Unfocus button colors in Paper mode for clear contrast.

## 0.3.46 — Compact focus status

- Shortened the visible focused-branch status so it and the Unfocus button remain inside narrow toolbars.
- Kept the complete focused-node name available through the tooltip and accessibility label.

## 0.3.45 — Clearer connector labels

- Kept labels on right-angle Linear and Staggered connectors close to the child node they describe.
- Prevented labels from floating around the midpoint of long trunk routes or appearing in disconnected rows.
- Applied the corrected placement to the canvas and visual exports.

## 0.3.44 — Expanded layouts

- Added Staggered Up, Down, Left, and Right layouts from Mind Map.
- Added Linear Left and Up, Left and Down, Right and Up, and Right and Down layouts.
- Extended the visual picker, keyboard navigation, connectors, labels, and visual exports for every new layout.

## 0.3.43 — Visual layout picker

- Replaced the layout submenu with a dedicated Mind Map-style selection window.
- Added Standard and Linear family controls with a live preview of every direction.
- Added Apply and Cancel controls so browsing layouts does not change the decision prematurely.
- Used the same picker for the canvas menu, Decision options, and the default-layout setting.

## 0.3.42 — Pinned node information

- Added Mind Map-style pin and collapse controls to selected node information in the Decision summary.
- Kept pinned information visible while selecting other nodes and remembered the collapsed state with the decision.
- Preserved the prior expanded or collapsed state when opening existing decision files.

## 0.3.41 — Refined Dark palette

- Changed the Dark canvas to `#181818`, toolbar to `#202020`, and grid dots to `#2b2b2b`.

## 0.3.40 — Reliable Layout menu
- Displayed Standard and Linear layouts as clearly labeled groups in one Layout menu so their choices no longer become stuck when moving between nested flyouts.

## 0.3.39 — Linear orientations

- Reorganized the Layout menu into Standard and Linear submenus.
- Added Up and Left, Up and Right, Down and Left, and Down and Right Linear orientations.
- Mirrored node placement, trunk attachment, relationship labels, keyboard navigation, and visual exports for every orientation.
- Migrated the former Linear layout to Down and Right automatically.

## 0.3.38 — Linear level spacing

- Increased Linear layout's Compact level spacing to the former Extended distance.
- Increased Regular and Extended proportionately while leaving every tree layout unchanged.
- Applied the selected spacing consistently from the Decision to level one and between all deeper levels.

## 0.3.37 — Linear node styling

- Restored the normal node shape and content in Linear layout, including the standard Decision card.
- Moved the main vertical trunk from the Decision node's center to its left side and tightened the first-level branch offset.

## 0.3.36 — Linear layout

- Added a Linear layout with the Decision as a rounded title above a vertical trunk.
- Arranged visible nodes in reading order with deeper levels indented and connected by straight right-angle branches.
- Colored Linear connectors by node type and integrated the layout with defaults, navigation, collapse, focus, spacing, and visual exports.

## 0.3.35 — Matrix layout removed

- Removed the experimental Matrix layout from the interface, settings, layout engine, exports, styles, and documentation for future reconsideration.
- Restored any decision or default setting saved with the experimental layout to Top-down automatically.

## 0.3.34 — Matrix layout

- Added a Matrix layout with the Decision presented as a rounded title above aligned row groups.
- Placed top-level Options in the first column and aligned Benefits, Risks, and sub-options into consistent depth columns.
- Added Matrix to current-decision and default-layout menus, keyboard navigation, collapse behavior, focus, and visual exports.

## 0.3.33 — Stationary canvas background

- Moved the dotted workspace background from the oversized map canvas to the stationary viewport, matching The Kempf Simple Mind Map.
- Kept nodes and connectors pannable while the background remains visually anchored in Obsidian Default, Dark, and Paper modes.

## 0.3.32 — Background-matched branch controls

- Matched The Kempf Simple Mind Map by making the node collapse control transparent so it uses the node's surface in every background mode.
- Colored the minus and child-count badge with the node type accent and retained a subtle accent hover state.

## 0.3.31 — Clearer template previews

- Added visible Decision, Option, Benefit, and Risk labels to every node in the template preview.
- Strengthened the preview cards' type colors and borders so their roles are immediately distinguishable.

## 0.3.30 — Starting templates

- Added a Mind Map-style starting-template picker to new decisions with live descriptions and a separate preview window.
- Added Blank, Simple Choice, Buy or Keep, Education/Training, and Home Improvement templates.
- Previewed the actual Decision, Options, Benefits, and Risks that will be created.
- Applied the same template flow when initializing an empty decision file.

## 0.3.29 — Keyboard branch controls

- Added the requested Mind Map-style keyboard pattern: Enter or Tab adds a child, F2 edits, Space collapses or expands, and the Arrow keys navigate.
- Made Enter and Tab use the same context-sensitive child type as Add connected item while preserving branch locks and the rule that Benefits and Risks cannot have children.

## 0.3.28 — Collapse command states

- Matched The Kempf Simple Mind Map by disabling collapse and expand commands when their action would not change the current branch or map.

## 0.3.27 — Selected-level collapsing

- Changed the node menu's collapse-to-level action to use the selected node's level immediately, matching The Kempf Simple Mind Map.
- Set the background menu's collapse-to-level chooser to start at level 1.

## 0.3.26 — Collapse controls and branch locking

- Matched The Kempf Simple Mind Map with nested collapse controls for immediate children, entire branches, selected visible levels, and the full map.
- Added Space as a shortcut for collapsing or expanding the selected parent node.
- Added inherited branch locking that prevents edits, moves, pastes, and deletion beneath a locked node while leaving navigation, focus, and collapse available.
- Added lock indicators to protected nodes and preserved locks in decision files and JSON backups.

## 0.3.25 — Adjustable dim strength

- Added a per-decision Dim strength slider matching The Kempf Simple Mind Map, from 0% to 90% in 5% steps.
- Applied the selected strength consistently to unrelated nodes, connectors, labels, and visual map exports.

## 0.3.24 — Anchored branch toggling

- Matched The Kempf Simple Mind Map by preserving the clicked node's screen position when its branch is collapsed or expanded.
- Adjusted the saved viewport after relayout so surrounding nodes can move without making the canvas jump under the pointer.

## 0.3.23 — Mind Map-style branch control

- Replaced the upper-right Add child button with the branch collapse/expand control used by The Kempf Simple Mind Map.
- Displayed a minus badge for expanded branches and a `+N` child-count badge for collapsed branches.
- Removed the former direction-dependent collapse control from the branch edge; adding connected items remains available from the node menu.

## 0.3.22 — Presentation pagination

- Kept Presentation PDF output to one compact Letter page whenever the content fits.
- Added continuation pages for additional comparison rows and moved option snapshots intact when they would cross a page boundary.
- Added repeated headers, footers, page numbering, multi-page PDF generation, and a preview of every generated page.

## 0.3.21 — Compact presentation layout

- Rebuilt the Presentation PDF as a content-driven layout so sections follow their actual content instead of reserving large empty areas.
- Kept consistent fixed font sizes for titles and node labels, wrapping text and expanding its row or card rather than shrinking individual titles.
- Simplified the spacing, borders, corner radii, typography, and color accents for a cleaner professional report appearance.

## 0.3.20 — Amber Decision node

- Changed the Decision node from purple to amber so its hierarchy role is visually distinct from blue selection, blue Options, green Benefits, and red Risks.
- Applied the amber border, background tint, label, hover glow, selected-state combination, and visual-export color consistently across all backgrounds.

## 0.3.19 — Distinct selection state

- Changed selected nodes to use a crisp blue outline so they no longer resemble the purple-glowing Decision node.
- Kept the Decision node's purple hierarchy glow and combined it with a blue inner outline when the Decision itself is selected.
- Changed node hover feedback to a subtle blue-gray border while preserving the green drop-target state.

## 0.3.18 — Refined presentation design

- Changed the Presentation PDF to a clean white page with modern, color-highlighted result, warning, evidence, and option cards.
- Wrapped and dynamically fitted full node text inside presentation cards instead of shortening it with ellipses.
- Refined spacing, borders, typography, accents, and shadows for a more professional presentation.

## 0.3.9 — Readable presentation evidence

- Replaced the shrunken decision tree in Presentation PDF with readable strongest-benefit and greatest-risk lists.
- Added compact snapshots for the three leading options while keeping the full tree available through the existing map-only PDF export.

## 0.3.8 — Presentation PDF

- Added a separate polished, one-page Letter-size presentation containing the decision, recommendation, comparison chart, warning, and visible tree.
- Added an in-plugin Save/Cancel preview before the presentation opens the system save dialog.
- Kept the existing map-only PDF export unchanged.

## 0.3.7 — Remembered summary state

- Saved the Decision Summary's expanded or collapsed state with each decision and restored it when the file is reopened.

## 0.3.6 — Search and fit

- Added Fit decision controls that center and scale the currently visible full or focused map.
- Added a movable live node-title search with Previous/Next navigation, Ctrl/Cmd+F, automatic branch expansion, and focus-aware result reveal.

## 0.3.5 — Streamlined settings

- Reorganized global settings to match The Kempf Simple Mind Map, with decision defaults first and a dedicated folder section for choosing an existing folder or creating a nested folder inline.

## 0.3.4 — Consistent public naming

- Standardized the public name as The Kempf Simple Decision Helper and the author attribution as Kempf, matching The Kempf Simple Mind Map while preserving all compatibility-sensitive identifiers.

## 0.3.3 — Branch focus

- Removed the Related Obsidian notes and Source URL fields, leaving Supporting notes as the single optional evidence field.
- Standardized the user-facing scoring term as Risk throughout the plugin and documentation.
- Renamed the background choices to Obsidian Default, Dark, and Paper, with automatic migration from the former Light choice.
- Matched Paper mode to the Flowchart plugin's warm `#f7f3e8` palette and restored clear comparison rows and progress bars when Obsidian uses a dark theme.
- Unified hover, selected, drop-target, connector, comparison-row, and collapse-control states across Obsidian Default, Dark, and Paper backgrounds.
- Added a per-decision option to dim branches unrelated to the selected node, matching the Mind Map plugin's branch-focused behavior.
- Made the main Decision node easier to identify with a wider, stronger glow in every background mode.
- Expanded the canvas substantially in every direction and preserved existing decisions' saved viewport positions during migration.
- Extended the zoom range down to 5% and enlarged the surrounding canvas again so distant panning remains useful at very low zoom.
- Added Focus branch and Unfocus controls that preserve the selected branch, its descendants, and its path to the Decision while hiding unrelated branches.

## 0.3.17 — Compact node titles

- Changed the node text editor to a single-line field so Decision, Option, Benefit, and Risk titles stay concise.
- Kept Supporting notes as the multiline field for detailed evidence and reasoning.

## 0.3.16 — Supporting evidence

- Added optional supporting notes, Obsidian note links, and web source URLs to Benefits and Risks.
- Added evidence indicators to factor nodes and evidence details to the Decision Summary.
- Made related `[[Obsidian links]]` open their note directly from the summary.
- Included supporting evidence in Markdown reports and JSON backups.
- Validated web sources so only complete HTTP and HTTPS URLs become clickable links.

## 0.3.15 — Collapsible branches

- Added expand and collapse controls to every node that contains connected items.
- Saved collapsed branches with each decision so the compact view is restored when the file is reopened.
- Kept hidden branches included in scoring, Markdown reports, and JSON backups.
- Made SVG, JPG, and PDF exports match the currently visible map.
- Added a warning when required All Paths sub-options have not been evaluated, including their names in the summary and Markdown report.
- Fixed accumulated touchscreen long-press handlers when a map is redrawn or closed.

## 0.3.14 — Release metadata correction

- Republished the mobile and export improvements under a new version so Obsidian can process the release correctly.

## 0.3.13 — Mobile and export improvements

- Improved touchscreen panning, pinch-to-zoom, and long-press menu handling.
- Fixed the mobile node editor so all rating controls remain accessible.
- Restored JSON backup import and export.
- Restored Markdown, SVG, JPG, and PDF exports.
- Kept Markdown as a readable report and JSON as the only restorable backup format.

## 0.3.10 — Initial public release

- Create a separate visual decision map for each `.ksdh` vault file.
- Compare Options using normalized Benefit and Risk scores.
- Build recursive sub-options using Single Path or All Paths behavior.
- Mark hard limits as Deal-breakers.
- Display recommendations, ties, incomplete evaluations, limited evidence, and sensitive results.
- Navigate with mouse, keyboard, or touchscreen controls.
- Pan, zoom, rearrange, copy, paste, delete, undo, and redo branches.
- Choose four automatic layout directions and three spacing levels.
- Use Paper, Dark, or Obsidian Default backgrounds.
- Export Markdown reports, JSON backups, SVG, JPG, and PDF.
- Import verified JSON backups with damaged-file protection.
- Store global defaults and note-specific display settings.
