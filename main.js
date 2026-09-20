const {
  TextFileView,
  FuzzySuggestModal,
  Menu,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TFolder,
  normalizePath,
  setIcon,
} = require("obsidian");

const VIEW_TYPE = "kempfs-simple-decision-helper-view";
const FILE_EXTENSION = "ksdh";
const FORMAT_VERSION = 2;
const DEFAULT_SETTINGS = {
  defaultFolder: "",
  defaultBackground: "system",
  defaultLayout: "down",
  defaultZoom: "1",
  defaultSubOptionMode: "alternative",
  confirmDelete: true,
};
const CARD_WIDTH = 230;
const CARD_HEIGHT = 92;
// Layout footprints include the score summary that can extend below a card.
// Spacing is intentionally orientation-specific: rotating a vertical layout
// makes horizontal levels overlap because cards are much wider than they are tall.
const SCORE_FOOTER_HEIGHT = 48;
const VERTICAL_SIBLING_GAP = 110;
const VERTICAL_LEVEL_GAP = 135;
const HORIZONTAL_SIBLING_GAP = 90;
const HORIZONTAL_LEVEL_GAP = 165;
const TREE_MARGIN = 70;
const CANVAS_SPACE = 1200;

const NODE_TYPES = {
  decision: { label: "Decision", color: "decision" },
  option: { label: "Option", color: "option" },
  benefit: { label: "Benefit", color: "benefit" },
  risk: { label: "Risk", color: "risk" },
};

const DEFAULT_RELATIONSHIPS = {
  option: "Option",
  benefit: "Benefit",
  risk: "Risk",
};

const TYPE_GUIDANCE = {
  decision: "The specific question that must be resolved.",
  option: "A realistic course of action you could choose.",
  benefit: "A likely advantage of a specific option.",
  risk: "Something that could go wrong with a specific option.",
};

function emptyMap() {
  return {
    formatVersion: FORMAT_VERSION,
    rootId: null,
    nodes: [],
    zoom: 1,
    layout: "down",
    background: "dark",
    scrollLeft: null,
    scrollTop: null,
    selectedDetailsOpen: false,
    showWarnings: true,
    showScoreLabels: true,
    siblingSpacing: "regular",
    levelSpacing: "regular",
  };
}

function newMapWithDefaults(settings) {
  const zoomSetting = settings.defaultZoom || "1";
  return {
    ...emptyMap(),
    zoom: zoomSetting === "0.75" ? 0.75 : 1,
    fitOnOpen: zoomSetting === "fit",
    layout: settings.defaultLayout || "down",
    background: settings.defaultBackground || "system",
  };
}

class NodeEditorModal extends Modal {
  constructor(app, options) {
    super(app);
    this.heading = options.heading;
    this.text = options.text || "";
    this.type = options.type || "option";
    this.autoRelationship = !Object.prototype.hasOwnProperty.call(options, "relationship");
    this.relationship = this.autoRelationship
      ? (DEFAULT_RELATIONSHIPS[this.type] || "Related to")
      : (options.relationship || "");
    this.likelihood = Math.max(1, options.likelihood || 1);
    this.impact = Math.max(1, options.impact || 1);
    this.isConstraint = Boolean(options.isConstraint);
    this.subOptionMode = options.subOptionMode || "alternative";
    this.hasSubOptions = Boolean(options.hasSubOptions);
    this.allowedTypes = options.allowedTypes || null;
    this.isRoot = Boolean(options.isRoot);
    this.onSave = options.onSave;
  }

  onOpen() {
    this.modalEl.addClass("kdh-node-editor-modal");
    const { contentEl } = this;
    contentEl.addClass("kdh-editor");
    contentEl.createEl("h2", { text: this.heading });
    const formEl = contentEl.createDiv({ cls: "kdh-editor-scroll" });

    let relationshipInput;
    let typeHelp;
    let scoreBox;
    let optionBox;
    let dealBreakerGroup;

    const renderDealBreaker = () => {
      if (!dealBreakerGroup) return;
      dealBreakerGroup.toggleClass("is-hidden", this.type !== "risk");
    };

    const renderScoreControls = () => {
      if (!scoreBox) return;
      scoreBox.empty();
      if (this.type !== "benefit" && this.type !== "risk") return;
      scoreBox.createDiv({
        cls: "kdh-score-help",
        text: "Use 1 for very low and 5 for very high.",
      });
      const likelihoodValue = scoreBox.createSpan({ cls: "kdh-slider-value" });
      const updateLikelihood = () => likelihoodValue.setText(String(this.likelihood));
      new Setting(scoreBox)
        .setName("How likely is this?")
        .addSlider((slider) => slider
          .setLimits(1, 5, 1)
          .setValue(this.likelihood)
          .onChange((value) => { this.likelihood = value; updateLikelihood(); }));
      scoreBox.lastElementChild?.querySelector(".setting-item-control")?.prepend(likelihoodValue);
      updateLikelihood();

      const impactValue = scoreBox.createSpan({ cls: "kdh-slider-value" });
      const updateImpact = () => impactValue.setText(String(this.impact));
      new Setting(scoreBox)
        .setName("How much would it matter?")
        .addSlider((slider) => slider
          .setLimits(1, 5, 1)
          .setValue(this.impact)
          .onChange((value) => { this.impact = value; updateImpact(); }));
      scoreBox.lastElementChild?.querySelector(".setting-item-control")?.prepend(impactValue);
      updateImpact();

    };

    const renderOptionControls = () => {
      if (!optionBox) return;
      optionBox.empty();
      if (this.type !== "option" || !this.hasSubOptions) return;
      new Setting(optionBox)
        .setName("How do these sub-options work?")
        .addDropdown((dropdown) => dropdown
          .addOption("alternative", "Single Path")
          .addOption("combined", "All Paths")
          .setValue(this.subOptionMode)
          .onChange((value) => { this.subOptionMode = value; }));
    };

    const topLine = formEl.createDiv({ cls: `kdh-editor-topline${this.isRoot ? " is-root" : ""}` });
    if (!this.isRoot) {
      const connectionGroup = topLine.createDiv({ cls: "kdh-topline-group kdh-connection-group" });
      connectionGroup.createEl("label", { text: "Connection label" });
      relationshipInput = connectionGroup.createEl("input", { attr: { type: "text", placeholder: "Option" } });
      relationshipInput.value = this.relationship;
      relationshipInput.addEventListener("input", () => {
        this.relationship = relationshipInput.value;
        this.autoRelationship = false;
      });
    }

    const typeGroup = topLine.createDiv({ cls: "kdh-topline-group kdh-type-group" });
    typeGroup.createEl("label", { text: "Type" });
    const typeSelect = typeGroup.createEl("select", { cls: "dropdown" });
    for (const [value, info] of Object.entries(NODE_TYPES)) {
      if (!this.isRoot && value === "decision") continue;
      if (this.allowedTypes && !this.allowedTypes.includes(value)) continue;
      const option = typeSelect.createEl("option", { text: info.label });
      option.value = value;
    }
    typeSelect.value = this.type;
    typeSelect.disabled = this.isRoot;
    typeSelect.addEventListener("change", () => {
      this.type = typeSelect.value;
      if (this.autoRelationship && relationshipInput) {
        this.relationship = DEFAULT_RELATIONSHIPS[this.type] || "Related to";
        relationshipInput.value = this.relationship;
      }
      if (typeHelp) typeHelp.setText(TYPE_GUIDANCE[this.type] || "");
      renderScoreControls();
      renderOptionControls();
      renderDealBreaker();
    });

    dealBreakerGroup = topLine.createDiv({ cls: "kdh-topline-group kdh-deal-breaker-group" });
    dealBreakerGroup.createEl("label", { text: "Deal-breaker" });
    new Setting(dealBreakerGroup).addToggle((toggle) => toggle
      .setValue(this.isConstraint)
      .setTooltip("Disqualify any option path containing this risk")
      .onChange((value) => { this.isConstraint = value; }));
    renderDealBreaker();
    typeHelp = formEl.createDiv({ cls: "kdh-type-help", text: TYPE_GUIDANCE[this.type] || "" });

    let textarea;
    new Setting(formEl)
      .setClass("kdh-text-setting")
      .setName("Node text")
      .addTextArea((field) => {
        textarea = field.inputEl;
        field
          .setPlaceholder(this.isRoot ? "What needs to be decided?" : "Enter the option, benefit, or risk")
          .setValue(this.text)
          .onChange((value) => { this.text = value; });
        textarea.rows = 5;
      });

    scoreBox = formEl.createDiv({ cls: "kdh-score-controls" });
    optionBox = formEl.createDiv({ cls: "kdh-option-controls" });
    renderScoreControls();
    renderOptionControls();

    const actions = contentEl.createDiv({ cls: "kdh-editor-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const saveButton = actions.createEl("button", { text: "Save", cls: "mod-cta" });

    const save = () => {
      const text = this.text.trim();
      if (!text) {
        new Notice("Enter text for the node.");
        return;
      }
      this.onSave({
        text,
        type: this.isRoot ? "decision" : this.type,
        relationship: this.relationship.trim(),
        likelihood: this.type === "benefit" || this.type === "risk" ? this.likelihood : 0,
        impact: this.type === "benefit" || this.type === "risk" ? this.impact : 0,
        isConstraint: this.type === "risk" ? this.isConstraint : false,
        subOptionMode: this.type === "option" ? this.subOptionMode : "alternative",
      });
      this.close();
    };

    saveButton.addEventListener("click", save);
    textarea.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !(event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        save();
      }
    });
    setTimeout(() => textarea.focus(), 0);
  }

  onClose() { this.contentEl.empty(); }
}

class RelationshipModal extends Modal {
  constructor(app, value, onSave) {
    super(app);
    this.value = value || "";
    this.onSave = onSave;
  }

  onOpen() {
    this.contentEl.createEl("h2", { text: "Edit connection label" });
    let input;
    new Setting(this.contentEl).addText((field) => {
      input = field.inputEl;
      field.setValue(this.value).onChange((value) => { this.value = value; });
    });
    const actions = this.contentEl.createDiv({ cls: "kdh-editor-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const save = () => { this.onSave(this.value.trim()); this.close(); };
    actions.createEl("button", { text: "Save", cls: "mod-cta" }).addEventListener("click", save);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") { event.preventDefault(); save(); }
    });
    setTimeout(() => input.focus(), 0);
  }

  onClose() { this.contentEl.empty(); }
}

class DecisionHelpModal extends Modal {
  onOpen() {
    this.modalEl.addClass("kdh-help-modal");
    const { contentEl } = this;
    contentEl.addClass("kdh-help-content");
    contentEl.createEl("h2", { text: "Simple Decision Helper" });
    contentEl.createEl("p", { cls: "kdh-help-intro", text: "Build the decision from the top down, rate the likely benefits and risks, and compare the options. The result organizes your judgment; it does not guarantee the correct answer." });

    const section = (title, text, items = []) => {
      contentEl.createEl("h3", { text: title });
      if (text) contentEl.createEl("p", { text });
      if (items.length) {
        const list = contentEl.createEl("ul");
        for (const item of items) list.createEl("li", { text: item });
      }
    };
    const formula = (name, expression, note) => {
      const box = contentEl.createDiv({ cls: "kdh-help-formula" });
      box.createDiv({ cls: "kdh-help-formula-name", text: name });
      box.createEl("code", { text: expression });
      if (note) box.createDiv({ cls: "kdh-help-formula-note", text: note });
    };

    contentEl.createEl("h3", { text: "Quick start" });
    const steps = contentEl.createEl("ol");
    [
      "Write one clear question in the Decision node.",
      "Add each realistic choice as an Option.",
      "Under each option, add the good outcomes as Benefits and possible problems as Risks.",
      "Rate every benefit and risk for Likelihood and Impact.",
      "Compare the options in the Decision summary. Review any warning before relying on the leader.",
    ].forEach((text) => steps.createEl("li", { text }));

    section("What each node means", "", [
      "Decision: the question you are trying to answer. A file has one Decision node.",
      "Option: something you could actually choose or do.",
      "Benefit: a possible good result of an option. Benefits are final scoring factors and cannot have children.",
      "Risk: a possible cost, problem, or bad result of an option. Risks are final scoring factors and cannot have children.",
    ]);
    section("Rating benefits and risks", "Likelihood means how likely the result is. Impact means how much it would matter. Both run from 1 (very low) to 5 (very high). For example, rain might be likely (4) but have a small impact (2).");
    section("How scores work", "The helper uses the same consistent calculation for every choice. You only supply the two simple 1–5 ratings.");
    formula("Factor score", "Likelihood × Impact", "Each benefit or risk scores from 1 to 25.");
    formula("Option score", "((Σ Benefit Scores − Σ Risk Scores) ÷ (Number of Factors × 25)) × 100", "This puts every option on the same −100 to +100 scale, even when options have different numbers of factors.");
    formula("Main decision score", "max(Eligible Top-Level Option Scores)", "The decision shows the strongest option that is not blocked by a deal-breaker.");
    section("Reading the scale", "+100 is entirely favorable, −100 is entirely unfavorable, and a score near 0 is balanced. The score helps comparison; it does not make the choice for you.");
    section("Sub-options: Single Path or All Paths", "Use Single Path when the child options are alternatives, such as drive, take the bus, or walk. Use All Paths when every child is part of one plan, such as review notes, practice questions, and get enough sleep.");
    section("Sub-option badges", "An option with child options is marked SINGLE PATH or ALL PATHS, so the tree shows whether it will select the strongest child path or combine every child path.");
    section("Deal-breakers", "Turn this on only for a risk that makes an option unacceptable regardless of its numerical score—for example, an option that exceeds a firm budget limit.");
    section("Reading the Decision summary", "The comparison chart is ordered from strongest to weakest. Red extends left for risks and green extends right for benefits. Click an option in the chart to select and reveal the same node in the tree. Not evaluated means an option has no benefits or risks yet and is excluded from the recommendation.");
    section("Mouse and touch", "", [
      "Drag empty background with the left or middle mouse button to pan.",
      "Use the mouse wheel or a two-finger pinch to zoom.",
      "Drag a node onto a valid Decision or Option node to move its entire branch.",
      "Double-click a node to edit it.",
      "Right-click a node to move, copy, paste, edit, or delete its branch.",
      "Right-click the background for layout, background color, JSON backup import, and export options.",
      "On a touchscreen, press and hold a node or the background to open the same menus.",
    ]);
    section("Keyboard", "", [
      "Arrow keys move through the visible tree.",
      "Enter edits the selected node.",
      "Tab adds an Option beneath a selected Decision or Option.",
      "With an Option selected, B adds a Benefit and D adds a Drawback.",
      "Delete removes the selected branch after confirmation.",
      "Inside the node editor, Enter saves and Ctrl/Cmd+Enter inserts a new line.",
      "Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redoes.",
    ]);
    section("Files and toolbar", "Each decision is its own .ksdh vault file. Global settings control the defaults for new decisions. The toolbar settings button opens options for the current decision, including warnings, node score labels, sibling spacing, and level spacing. The file-plus button starts another decision; the curved arrows undo and redo; minus and plus change zoom; the question mark opens this guide.");
    section("Import and export", "JSON is the complete backup format and the only format that can restore a decision. Markdown creates a readable report without hidden backup data. SVG and JPG create shareable images, while PDF creates a printable one-page overview.");
  }

  onClose() { this.contentEl.empty(); }
}

class DecisionOptionsModal extends Modal {
  constructor(app, view) {
    super(app);
    this.view = view;
    this.values = {
      showWarnings: view.map.showWarnings !== false,
      showScoreLabels: view.map.showScoreLabels !== false,
      siblingSpacing: view.map.siblingSpacing || "regular",
      levelSpacing: view.map.levelSpacing || "regular",
    };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Decision options" });
    contentEl.createEl("p", { text: "These settings apply only to this decision file." });
    new Setting(contentEl)
      .setName("Show instructional warnings")
      .setDesc("Show limited-evidence and sensitivity notices")
      .addToggle((toggle) => toggle
        .setValue(this.values.showWarnings)
        .onChange((value) => { this.values.showWarnings = value; }));
    new Setting(contentEl)
      .setName("Show score labels on nodes")
      .setDesc("Show factor scores and option results directly on the tree")
      .addToggle((toggle) => toggle
        .setValue(this.values.showScoreLabels)
        .onChange((value) => { this.values.showScoreLabels = value; }));
    const addSpacing = (name, description, key) => {
      new Setting(contentEl)
        .setName(name)
        .setDesc(description)
        .addDropdown((dropdown) => dropdown
          .addOption("compact", "Compact")
          .addOption("regular", "Regular")
          .addOption("extended", "Extended")
          .setValue(this.values[key])
          .onChange((value) => { this.values[key] = value; }));
    };
    addSpacing("Sibling spacing", "Space between nodes on the same level", "siblingSpacing");
    addSpacing("Level spacing", "Space between parent and child levels", "levelSpacing");

    const actions = contentEl.createDiv({ cls: "kdh-editor-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    actions.createEl("button", { text: "Save", cls: "mod-cta" }).addEventListener("click", async () => {
      const spacingChanged = this.view.map.siblingSpacing !== this.values.siblingSpacing
        || this.view.map.levelSpacing !== this.values.levelSpacing;
      const scrollLeft = this.view.currentScroller?.scrollLeft ?? this.view.map.scrollLeft;
      const scrollTop = this.view.currentScroller?.scrollTop ?? this.view.map.scrollTop;
      Object.assign(this.view.map, this.values, {
        scrollLeft: spacingChanged ? null : scrollLeft,
        scrollTop: spacingChanged ? null : scrollTop,
      });
      await this.view.saveMap();
      this.view.render();
      this.close();
    });
  }

  onClose() { this.contentEl.empty(); }
}

class FolderSuggestModal extends FuzzySuggestModal {
  constructor(app, onChoose) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("Choose a folder for new decision files");
  }

  getItems() {
    return this.app.vault.getAllLoadedFiles()
      .filter((item) => item instanceof TFolder)
      .sort((a, b) => a.path.localeCompare(b.path));
  }

  getItemText(folder) { return folder.path || "Vault root"; }
  onChooseItem(folder) { this.onChoose(folder.path); }
}

class CreateFolderModal extends Modal {
  constructor(app, onCreate) {
    super(app);
    this.onCreate = onCreate;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Create decision folder" });
    contentEl.createEl("p", { text: "Enter a vault path, such as Decisions or Work/Decisions." });
    let input;
    new Setting(contentEl).setName("Folder path").addText((text) => {
      input = text.inputEl;
      text.setPlaceholder("Decisions");
    });
    const actions = contentEl.createDiv({ cls: "kdh-editor-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const create = async () => {
      const path = input.value.trim();
      if (!path) {
        new Notice("Enter a folder path.");
        return;
      }
      const created = await this.onCreate(path);
      if (created) this.close();
    };
    actions.createEl("button", { text: "Create and use", cls: "mod-cta" }).addEventListener("click", create);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        create();
      }
    });
    setTimeout(() => input.focus(), 0);
  }

  onClose() { this.contentEl.empty(); }
}

class DecisionHelperSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Kempf's Simple Decision Helper" });
    new Setting(containerEl)
      .setName("Default decision folder")
      .setDesc(`New .${FILE_EXTENSION} files will be saved in: ${this.plugin.settings.defaultFolder || "Vault root"}`)
      .addButton((button) => button
        .setButtonText("Choose folder")
        .onClick(() => new FolderSuggestModal(this.app, async (path) => {
          this.plugin.settings.defaultFolder = path;
          await this.plugin.saveSettings();
          this.display();
        }).open()))
      .addButton((button) => button
        .setButtonText("New folder")
        .onClick(() => new CreateFolderModal(this.app, async (path) => {
          const createdPath = await this.plugin.createFolderPath(path);
          if (createdPath === null) return false;
          this.plugin.settings.defaultFolder = createdPath;
          await this.plugin.saveSettings();
          this.display();
          return true;
        }).open()))
      .addExtraButton((button) => button
        .setIcon("rotate-ccw")
        .setTooltip("Use vault root")
        .onClick(async () => {
          this.plugin.settings.defaultFolder = "";
          await this.plugin.saveSettings();
          this.display();
        }));

    containerEl.createEl("h3", { text: "New decision defaults" });
    new Setting(containerEl)
      .setName("Default background")
      .setDesc("Background used when a new decision is created")
      .addDropdown((dropdown) => dropdown
        .addOption("system", "Follow Obsidian")
        .addOption("dark", "Dark")
        .addOption("light", "Light")
        .setValue(this.plugin.settings.defaultBackground)
        .onChange(async (value) => {
          this.plugin.settings.defaultBackground = value;
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName("Default layout")
      .setDesc("Direction used by new decision trees")
      .addDropdown((dropdown) => dropdown
        .addOption("down", "Top-down")
        .addOption("up", "Bottom-up")
        .addOption("right", "Left-to-right")
        .addOption("left", "Right-to-left")
        .setValue(this.plugin.settings.defaultLayout)
        .onChange(async (value) => {
          this.plugin.settings.defaultLayout = value;
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName("Default zoom")
      .setDesc("Initial view used by new decisions")
      .addDropdown((dropdown) => dropdown
        .addOption("0.75", "75%")
        .addOption("1", "100%")
        .addOption("fit", "Fit to screen")
        .setValue(this.plugin.settings.defaultZoom)
        .onChange(async (value) => {
          this.plugin.settings.defaultZoom = value;
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName("Default sub-option behavior")
      .setDesc("How newly created options handle their sub-options")
      .addDropdown((dropdown) => dropdown
        .addOption("alternative", "Single Path")
        .addOption("combined", "All Paths")
        .setValue(this.plugin.settings.defaultSubOptionMode)
        .onChange(async (value) => {
          this.plugin.settings.defaultSubOptionMode = value;
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName("Confirm before deleting")
      .setDesc("Ask before deleting a node and everything beneath it")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.confirmDelete)
        .onChange(async (value) => {
          this.plugin.settings.confirmDelete = value;
          await this.plugin.saveSettings();
        }));
  }
}

class DecisionMapView extends TextFileView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.map = emptyMap();
    this.undoStack = [];
    this.redoStack = [];
    this.dataLoaded = false;
    this.viewOpened = false;
    this.promptTimer = null;
    this.touchPointers = new Map();
    this.touchGestureMoved = false;
    this.touchGestureMulti = false;
    this.touchSuppressUntil = 0;
    this.longPressCancellers = new Set();
    this.activeMenu = null;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return this.file?.basename || "Decision Helper"; }
  getIcon() { return "git-branch"; }

  getViewData() { return this.unreadableData ?? JSON.stringify({ ...this.map, formatVersion: FORMAT_VERSION }, null, 2); }

  setViewData(data) {
    try {
      const parsed = JSON.parse(data);
      if (!parsed?.rootId || !Array.isArray(parsed.nodes)) throw new Error("Missing decision map structure");
      const ids = new Set();
      for (const node of parsed.nodes) {
        if (!node?.id || ids.has(node.id) || !NODE_TYPES[node.type]) throw new Error("Invalid or duplicate node");
        ids.add(node.id);
        node.text = String(node.text || "Untitled");
        node.childIds = Array.isArray(node.childIds) ? node.childIds : [];
      }
      const rootNode = parsed.nodes.find((node) => node.id === parsed.rootId);
      if (!rootNode || rootNode.type !== "decision") throw new Error("Missing Decision node");
      this.map = { ...emptyMap(), ...parsed, formatVersion: FORMAT_VERSION };
      for (const node of this.map.nodes) {
        delete node.isEndpoint;
        if (node.type === "benefit" || node.type === "risk") {
          node.likelihood = Math.min(5, Math.max(1, Number(node.likelihood) || 1));
          node.impact = Math.min(5, Math.max(1, Number(node.impact) || 1));
          const parent = this.map.nodes.find((item) => item.id === node.parentId);
          if (parent && node.childIds?.length) {
            for (const childId of node.childIds) {
              const child = this.map.nodes.find((item) => item.id === childId);
              if (child) child.parentId = parent.id;
              if (!parent.childIds.includes(childId)) parent.childIds.push(childId);
            }
            node.childIds = [];
          }
        }
      }
      const byId = new Map(this.map.nodes.map((node) => [node.id, node]));
      for (const node of this.map.nodes) node.childIds = [];
      for (const node of this.map.nodes) {
        if (node.id === this.map.rootId) { node.parentId = null; continue; }
        let parent = byId.get(node.parentId);
        if (!parent || (parent.type !== "decision" && parent.type !== "option") || (parent.type === "decision" && node.type !== "option")) {
          parent = node.type === "option" ? rootNode : null;
          if (!parent) throw new Error(`Invalid parent for ${node.text}`);
          node.parentId = parent.id;
        }
        parent.childIds.push(node.id);
      }
      const visited = new Set();
      const visiting = new Set();
      const walk = (node) => {
        if (visiting.has(node.id)) throw new Error("The decision contains a circular branch");
        if (visited.has(node.id)) return;
        visiting.add(node.id);
        node.childIds.forEach((id) => walk(byId.get(id)));
        visiting.delete(node.id);
        visited.add(node.id);
      };
      walk(rootNode);
      if (visited.size !== this.map.nodes.length) throw new Error("The decision contains disconnected nodes");
      this.unreadableData = null;
      this.loadError = null;
    } catch (error) {
      this.unreadableData = data;
      this.loadError = error?.message || "Invalid decision file";
      new Notice("This decision file could not be read. Its original data was preserved.");
    }
    this.undoStack = [];
    this.redoStack = [];
    this.dataLoaded = true;
    clearTimeout(this.promptTimer);
    if (this.viewOpened) {
      this.render();
      this.scheduleDecisionPrompt();
    }
  }

  clear() {
    this.map = emptyMap();
    this.dataLoaded = false;
    clearTimeout(this.promptTimer);
  }

  async saveMap() { this.requestSave(); }

  async onOpen() {
    await super.onOpen();
    this.viewOpened = true;
    this.containerEl.tabIndex = -1;
    this.registerDomEvent(this.containerEl, "keydown", (event) => this.handleShortcut(event));
    if (this.dataLoaded) {
      this.render();
      this.scheduleDecisionPrompt();
    }
  }

  async onClose() {
    clearTimeout(this.zoomSaveTimer);
    clearTimeout(this.promptTimer);
    this.viewOpened = false;
    await super.onClose();
  }

  scheduleDecisionPrompt() {
    clearTimeout(this.promptTimer);
    this.promptTimer = setTimeout(() => {
      if (this.viewOpened && this.dataLoaded && !this.map.rootId) this.promptForDecision();
    }, 0);
  }

  render() {
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass("kdh-view");
    root.removeClass("kdh-background-light");
    root.removeClass("kdh-background-dark");
    const background = this.map.background || "system";
    if (background === "light" || background === "dark") root.addClass(`kdh-background-${background}`);

    if (this.loadError) {
      const errorBox = root.createDiv({ cls: "kdh-empty" });
      errorBox.createEl("h2", { text: "Decision file needs repair" });
      errorBox.createEl("p", { text: `${this.loadError}. The original file has not been replaced.` });
      return;
    }
    if (!this.map.rootId) {
      const empty = root.createDiv({ cls: "kdh-empty" });
      empty.createEl("h2", { text: "Start a decision map" });
      empty.createEl("p", { text: "Begin with the decision, then add options with their benefits and risks." });
      empty.createEl("button", { text: "Enter decision", cls: "mod-cta" })
        .addEventListener("click", () => this.promptForDecision());
      return;
    }

    this.renderToolbar(root);
    const scroller = root.createDiv({ cls: "kdh-scroller" });
    const canvas = scroller.createDiv({ cls: "kdh-canvas" });
    const layout = this.calculateLayout();
    this.nodePositions = layout.positions;
    const zoom = Math.max(0.2, Math.min(2, this.map.zoom || 1));
    this.map.zoom = zoom;
    canvas.style.width = `${layout.width}px`;
    canvas.style.height = `${layout.height}px`;
    canvas.style.zoom = String(zoom);
    this.currentCanvas = canvas;
    this.currentScroller = scroller;
    this.updateToolbar();
    this.installNavigation(scroller, canvas);
    scroller.addEventListener("contextmenu", (event) => {
      if (Date.now() < this.touchSuppressUntil) {
        event.preventDefault();
        return;
      }
      if (event.target.closest(".kdh-node, .kdh-edge-label")) return;
      this.showBackgroundMenu(event);
    });

    const svg = canvas.createSvg("svg", {
      cls: "kdh-lines",
      attr: { width: String(layout.width), height: String(layout.height) },
    });

    this.drawEdges(svg, layout.positions);
    this.drawNodes(canvas, layout.positions);
    this.installLongPress(canvas, (event) => {
      if (!event.target.closest(".kdh-node, .kdh-edge-label, button")) this.showBackgroundMenu(event);
    });
    this.renderSummary(root);

    requestAnimationFrame(() => {
      if (!scroller.isConnected) return;
      const positioned = [...layout.positions.values()];
      if (this.map.fitOnOpen && positioned.length > 1) {
        const minX = Math.min(...positioned.map((item) => item.x));
        const maxX = Math.max(...positioned.map((item) => item.x + CARD_WIDTH));
        const minY = Math.min(...positioned.map((item) => item.y));
        const maxY = Math.max(...positioned.map((item) => item.y + CARD_HEIGHT + SCORE_FOOTER_HEIGHT));
        const fittedZoom = Math.max(0.2, Math.min(1, (scroller.clientWidth - 90) / (maxX - minX), (scroller.clientHeight - 90) / (maxY - minY)));
        this.map.zoom = fittedZoom;
        this.map.fitOnOpen = false;
        canvas.style.zoom = String(fittedZoom);
        scroller.scrollLeft = Math.max(0, ((minX + maxX) / 2) * fittedZoom - scroller.clientWidth / 2);
        scroller.scrollTop = Math.max(0, ((minY + maxY) / 2) * fittedZoom - scroller.clientHeight / 2);
        this.map.scrollLeft = scroller.scrollLeft;
        this.map.scrollTop = scroller.scrollTop;
        this.updateToolbar();
        this.saveMap();
      } else if (Number.isFinite(this.map.scrollLeft) && Number.isFinite(this.map.scrollTop)) {
        scroller.scrollLeft = this.map.scrollLeft;
        scroller.scrollTop = this.map.scrollTop;
      } else {
        const rootPosition = layout.positions.get(this.map.rootId);
        scroller.scrollLeft = Math.max(0, (rootPosition.x + CARD_WIDTH / 2) * zoom - scroller.clientWidth / 2);
        scroller.scrollTop = Math.max(0, rootPosition.y * zoom - 70);
      }
    });
  }

  renderToolbar(root) {
    const toolbar = root.createDiv({ cls: "kdh-toolbar" });
    const addButton = (icon, label, action) => {
      const button = toolbar.createEl("button", { cls: "clickable-icon", attr: { "aria-label": label } });
      setIcon(button, icon);
      button.addEventListener("click", action);
      return button;
    };
    addButton("file-plus-2", "New decision", () => this.plugin.createNewDecision());
    toolbar.createDiv({ cls: "kdh-toolbar-divider" });
    this.undoButton = addButton("undo-2", "Undo", () => this.undo());
    this.redoButton = addButton("redo-2", "Redo", () => this.redo());
    toolbar.createDiv({ cls: "kdh-toolbar-divider" });
    addButton("zoom-out", "Zoom out", () => this.changeZoom(0.9));
    this.zoomLabel = toolbar.createSpan({ cls: "kdh-zoom-label" });
    addButton("zoom-in", "Zoom in", () => this.changeZoom(1.1));
    toolbar.createDiv({ cls: "kdh-toolbar-divider" });
    addButton("settings-2", "Decision options", () => new DecisionOptionsModal(this.app, this).open());
    toolbar.createDiv({ cls: "kdh-toolbar-spacer" });
    addButton("circle-help", "Help", () => new DecisionHelpModal(this.app).open());
  }

  snapshot() {
    return JSON.stringify({
      rootId: this.map.rootId,
      nodes: this.map.nodes,
      layout: this.map.layout || "down",
    });
  }

  recordHistory() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 100) this.undoStack.shift();
    this.redoStack = [];
    this.updateToolbar();
  }

  async restoreSnapshot(serialized) {
    const state = JSON.parse(serialized);
    const scrollLeft = this.currentScroller?.scrollLeft ?? this.map.scrollLeft;
    const scrollTop = this.currentScroller?.scrollTop ?? this.map.scrollTop;
    const zoom = this.map.zoom || 1;
    const selectedId = this.map.selectedId;
    this.map = {
      ...this.map,
      ...state,
      zoom,
      scrollLeft,
      scrollTop,
      selectedId: state.nodes.some((node) => node.id === selectedId) ? selectedId : null,
    };
    await this.saveMap();
    this.render();
  }

  async undo() {
    if (!this.undoStack.length) return;
    this.redoStack.push(this.snapshot());
    await this.restoreSnapshot(this.undoStack.pop());
  }

  async redo() {
    if (!this.redoStack.length) return;
    this.undoStack.push(this.snapshot());
    await this.restoreSnapshot(this.redoStack.pop());
  }

  updateToolbar() {
    if (this.undoButton) this.undoButton.disabled = !this.undoStack.length;
    if (this.redoButton) this.redoButton.disabled = !this.redoStack.length;
    if (this.zoomLabel) this.zoomLabel.setText(`${Math.round((this.map.zoom || 1) * 100)}%`);
  }

  renderSummary(root) {
    const panel = root.createDiv({ cls: `kdh-summary-panel${this.summaryCollapsed ? " is-collapsed" : ""}` });
    this.summaryPanel = panel;
    const header = panel.createDiv({ cls: "kdh-summary-header" });
    header.createSpan({ text: "Decision summary" });
    const toggle = header.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": this.summaryCollapsed ? "Expand decision summary" : "Collapse decision summary" },
    });
    setIcon(toggle, this.summaryCollapsed ? "chevron-down" : "chevron-up");
    toggle.addEventListener("click", () => {
      this.summaryCollapsed = !this.summaryCollapsed;
      this.render();
    });
    if (!this.summaryCollapsed) this.renderSummaryContent(panel);
  }

  renderSummaryContent(panel = this.summaryPanel) {
    if (!panel || this.summaryCollapsed) return;
    panel.querySelector(".kdh-summary-content")?.remove();
    const content = panel.createDiv({ cls: "kdh-summary-content" });
    this.summaryContentEl = content;
    const selected = this.getNode(this.map.selectedId);
    const options = this.rankedTopLevelOptions();

    if (!options.length) {
      content.createDiv({ cls: "kdh-summary-empty", text: "Rate benefits and risks to compare the options." });
    } else {
      const eligible = options.filter((entry) => entry.totals.score !== null && !entry.totals.disqualified);
      const leader = eligible[0] || options[0];
      const tied = eligible.filter((entry) => entry.totals.score === leader?.totals.score);
      const isTie = tied.length > 1;
      const needsMoreInfo = !eligible.length;
      content.createDiv({ cls: "kdh-summary-label", text: needsMoreInfo ? "Not evaluated" : (isTie ? "Tie" : "Current leader") });
      if (needsMoreInfo) {
        content.createDiv({ cls: "kdh-summary-empty", text: "Add at least one benefit or risk to an option." });
      } else {
        content.createDiv({ cls: "kdh-summary-leading", text: isTie ? tied.map((entry) => entry.node.text).join(" · ") : leader.node.text });
        content.createDiv({
          cls: `kdh-summary-simple-result${leader.totals.score < 0 ? " is-negative" : ""}`,
          text: `${this.scoreDescription(leader.totals.score)} · ${leader.totals.score >= 0 ? "+" : ""}${leader.totals.score}`,
        });
      }

      content.createDiv({ cls: "kdh-summary-label kdh-ranking-label", text: "Option comparison" });
      this.renderOptionComparisonChart(content, options, selected, leader, needsMoreInfo, new Set(tied.map((entry) => entry.node.id)));

      const warning = this.importantWarning(options, leader, needsMoreInfo);
      if (warning) {
        content.createDiv({ cls: "kdh-summary-label kdh-warning-label", text: "Check before deciding" });
        content.createDiv({ cls: "kdh-summary-warning", text: warning });
      }
    }

    if (selected && selected.type !== "decision") {
      const details = content.createEl("details", { cls: "kdh-selected-details" });
      details.open = Boolean(this.map.selectedDetailsOpen);
      details.addEventListener("toggle", () => {
        this.map.selectedDetailsOpen = details.open;
        this.saveMap();
      });
      details.createEl("summary", { text: "Selected node details" });
      const detailBody = details.createDiv({ cls: "kdh-selected-details-body" });
      this.renderSelectedNodeSummary(detailBody, selected);
    }
  }

  selectFromSummary(node) {
    this.selectNode(node, true);
  }

  selectNode(node, reveal = false) {
    if (!node || !this.nodePositions?.has(node.id)) return;
    this.map.selectedId = node.id;
    this.updateSelectionStyles();
    this.renderSummaryContent();
    if (reveal) this.revealNode(node.id);
    this.containerEl.focus();
    this.saveMap();
  }

  updateSelectionStyles() {
    const selectedId = String(this.map.selectedId || "");
    this.currentCanvas?.querySelectorAll(".kdh-node").forEach((element) => {
      const selected = element.dataset.nodeId === selectedId;
      element.toggleClass("is-selected", selected);
      element.setAttribute("aria-selected", selected ? "true" : "false");
    });
    this.summaryContentEl?.querySelectorAll(".kdh-comparison-row").forEach((element) => {
      element.toggleClass("is-selected", element.dataset.nodeId === selectedId);
    });
  }

  revealNode(nodeId) {
    const position = this.nodePositions?.get(nodeId);
    const scroller = this.currentScroller;
    if (!position || !scroller) return;
    const zoom = this.map.zoom || 1;
    const margin = 42;
    const left = position.x * zoom;
    const right = (position.x + CARD_WIDTH) * zoom;
    const top = position.y * zoom;
    const bottom = (position.y + CARD_HEIGHT + SCORE_FOOTER_HEIGHT) * zoom;
    let nextLeft = scroller.scrollLeft;
    let nextTop = scroller.scrollTop;
    if (left < nextLeft + margin) nextLeft = Math.max(0, left - margin);
    else if (right > nextLeft + scroller.clientWidth - margin) nextLeft = right - scroller.clientWidth + margin;
    if (top < nextTop + margin) nextTop = Math.max(0, top - margin);
    else if (bottom > nextTop + scroller.clientHeight - margin) nextTop = bottom - scroller.clientHeight + margin;
    scroller.scrollLeft = nextLeft;
    scroller.scrollTop = nextTop;
    this.map.scrollLeft = nextLeft;
    this.map.scrollTop = nextTop;
  }

  navigateSelection(key) {
    if (!this.nodePositions?.size) return;
    let selected = this.getNode(this.map.selectedId);
    if (!selected || !this.nodePositions.has(selected.id)) {
      selected = this.getNode(this.map.rootId);
      if (selected) this.selectNode(selected, true);
      return;
    }
    const parent = this.getNode(selected.parentId);
    const children = this.visibleChildren(selected);
    const siblings = parent ? this.visibleChildren(parent) : [selected];
    const index = siblings.findIndex((node) => node.id === selected.id);
    const previous = index > 0 ? siblings[index - 1] : null;
    const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;
    const actions = {
      down: { ArrowUp: parent, ArrowDown: children[0], ArrowLeft: previous, ArrowRight: next },
      up: { ArrowDown: parent, ArrowUp: children[0], ArrowLeft: previous, ArrowRight: next },
      right: { ArrowLeft: parent, ArrowRight: children[0], ArrowUp: previous, ArrowDown: next },
      left: { ArrowRight: parent, ArrowLeft: children[0], ArrowUp: previous, ArrowDown: next },
    };
    const target = (actions[this.map.layout || "down"] || actions.down)[key];
    if (target) this.selectNode(target, true);
  }

  renderOptionComparisonChart(content, options, selected, leader, needsMoreInfo, tiedIds = new Set()) {
    const chart = content.createDiv({ cls: "kdh-comparison-chart" });
    const legend = chart.createDiv({ cls: "kdh-comparison-legend" });
    legend.createSpan({ cls: "is-risk", text: "Risks" });
    legend.createSpan({ text: "0" });
    legend.createSpan({ cls: "is-benefit", text: "Benefits" });

    for (const entry of options) {
      const totals = entry.totals;
      const rated = totals.rated || 0;
      const maximum = rated * 25;
      const riskWidth = maximum ? Math.min(100, (totals.risks / maximum) * 100) : 0;
      const benefitWidth = maximum ? Math.min(100, (totals.benefits / maximum) * 100) : 0;
      const isLeader = !needsMoreInfo && tiedIds.has(entry.node.id) && !totals.disqualified;
      const row = chart.createEl("button", {
        cls: `kdh-comparison-row${entry.node.id === selected?.id ? " is-selected" : ""}${isLeader ? " is-leader" : ""}${totals.disqualified ? " is-blocked" : ""}`,
        attr: { "aria-label": `${entry.node.text}: ${totals.disqualified ? "blocked by a deal-breaker" : (totals.score === null ? "unrated" : `score ${totals.score}`)}` },
      });
      row.dataset.nodeId = entry.node.id;
      const heading = row.createDiv({ cls: "kdh-comparison-heading" });
      heading.createSpan({ cls: "kdh-comparison-name", text: entry.node.text });
      heading.createSpan({
        cls: `kdh-comparison-score${totals.disqualified || totals.score < 0 ? " is-negative" : ""}`,
        text: totals.disqualified ? "Blocked" : (totals.score === null ? "Not evaluated" : `${totals.score >= 0 ? "+" : ""}${totals.score}`),
      });
      const plot = row.createDiv({ cls: "kdh-comparison-plot" });
      const riskHalf = plot.createDiv({ cls: "kdh-comparison-half is-risk" });
      riskHalf.createDiv({ cls: "kdh-comparison-bar is-risk", attr: { style: `width:${riskWidth}%` } });
      const benefitHalf = plot.createDiv({ cls: "kdh-comparison-half is-benefit" });
      benefitHalf.createDiv({ cls: "kdh-comparison-bar is-benefit", attr: { style: `width:${benefitWidth}%` } });
      row.addEventListener("click", () => this.selectFromSummary(entry.node));
    }
  }

  importantWarning(options, leader, needsMoreInfo) {
    if (leader.totals.disqualifyingRisk) return `Every current path is blocked by a deal-breaker. ${leader.totals.disqualifyingRisk.text}`;
    if (needsMoreInfo) return "No option has enough information to calculate a score.";
    if (options.some((entry) => entry.totals.score === null)) return "Some options are not evaluated and were excluded from the comparison.";
    if (this.map.showWarnings === false) return null;
    if (options.some((entry) => (entry.totals.allRated ?? entry.totals.rated) < 2)) return "Limited evidence: Some options are based on fewer than two factors. Their scores are comparable, but may be less reliable.";
    const sensitivity = this.findSensitivity(leader.node.id);
    if (sensitivity) return sensitivity;
    return null;
  }

  rankedTopLevelOptions() {
    const root = this.getNode(this.map.rootId);
    return (root?.childIds || [])
      .map((id) => this.getNode(id))
      .filter((node) => node?.type === "option")
      .map((node) => ({
        node,
        totals: this.totalsForOption(node) || {
          benefits: 0, risks: 0, net: 0, score: null, benefitPercent: null,
          rated: 0, unrated: 1, allRated: 0, allUnrated: 1,
          highestRisk: null, disqualified: false, disqualifyingRisk: null,
          chosenOption: null, combinedOptions: null,
        },
      }))
      .sort((a, b) => this.compareTotals(b.totals, a.totals));
  }

  findSensitivity(baselineLeaderId) {
    for (const node of this.map.nodes) {
      if (node.type !== "benefit" && node.type !== "risk") continue;
      for (const field of ["likelihood", "impact"]) {
        const original = node[field];
        if (!original) continue;
        for (const delta of [-1, 1]) {
          const changed = original + delta;
          if (changed < 1 || changed > 5) continue;
          node[field] = changed;
          const changedLeader = this.rankedTopLevelOptions()[0];
          node[field] = original;
          if (changedLeader && changedLeader.node.id !== baselineLeaderId) {
            return `Sensitive result: changing “${node.text}” ${field} from ${original} to ${changed} changes the leading option.`;
          }
        }
      }
    }
    return null;
  }

  renderSelectedNodeSummary(content, node) {
    content.createDiv({ cls: "kdh-summary-label", text: `Selected ${NODE_TYPES[node.type]?.label || "node"}` });
    content.createDiv({ cls: `kdh-summary-selected-title is-${node.type}`, text: node.text });
    if (node.type === "option") {
      const totals = this.totalsForOption(node);
      if (!totals) {
        content.createDiv({ cls: "kdh-summary-empty", text: "Add benefits and risks to evaluate this option." });
        return;
      }
      this.addSummaryMetrics(content, totals);
      return;
    }

    const score = this.scoreForNode(node);
    if (score === null) {
      content.createDiv({ cls: "kdh-summary-unrated", text: "Set both likelihood and impact to calculate this node." });
      return;
    }
    const scoreRow = content.createDiv({ cls: `kdh-selected-factor-score is-${node.type}` });
    scoreRow.createSpan({ text: `${node.type === "benefit" ? "+" : "−"}${score}` });
    scoreRow.createSpan({ cls: "kdh-selected-factor-formula", text: `Likelihood ${node.likelihood} × impact ${node.impact}` });
    if (node.type === "risk" && node.isConstraint) content.createDiv({ cls: "kdh-summary-constraint", text: "This risk is a deal-breaker." });
  }

  addSummaryMetrics(content, totals) {
    const ratedForConfidence = totals.allRated ?? totals.rated;
    const unratedForConfidence = totals.allUnrated ?? totals.unrated;
    const totalFactors = ratedForConfidence + unratedForConfidence;
    const completeness = totalFactors ? Math.round((ratedForConfidence / totalFactors) * 100) : 0;
    const grid = content.createDiv({ cls: "kdh-summary-grid" });
    grid.createDiv({ cls: "is-benefit", text: totals.benefitPercent === null ? "Balance: unrated" : `${totals.benefitPercent}% benefit` });
    grid.createDiv({ cls: `is-net${totals.score < 0 ? " is-negative" : ""}`, text: `Score ${totals.score >= 0 ? "+" : ""}${totals.score}` });
    grid.createDiv({ cls: `is-complete${completeness < 100 ? " is-incomplete" : ""}`, text: `${ratedForConfidence}/${totalFactors} rated` });
    if (totals.highestRisk) {
      const risk = content.createDiv({ cls: "kdh-summary-risk" });
      risk.createSpan({ text: `Highest risk −${totals.highestRisk.score}: ` });
      risk.createSpan({ cls: "kdh-summary-risk-text", text: totals.highestRisk.text });
    }
    if (totals.disqualifyingRisk) content.createDiv({ cls: "kdh-summary-constraint", text: `Deal-breaker: ${totals.disqualifyingRisk.text}` });
    if (unratedForConfidence) content.createDiv({ cls: "kdh-summary-unrated", text: `${unratedForConfidence} factor${unratedForConfidence === 1 ? "" : "s"} still unrated` });
    if (totals.chosenOption) content.createDiv({ cls: "kdh-summary-path", text: `Best path: ${totals.chosenOption.text}` });
    if (totals.combinedOptions?.length) content.createDiv({ cls: "kdh-summary-path", text: `Combined: ${totals.combinedOptions.map((item) => item.text).join(", ")}` });
  }

  changeZoom(multiplier) {
    const scroller = this.currentScroller;
    if (!scroller || !this.currentCanvas) return;
    const oldZoom = this.map.zoom || 1;
    const nextZoom = Math.max(0.2, Math.min(2, oldZoom * multiplier));
    this.setZoomAt(nextZoom, scroller.clientWidth / 2, scroller.clientHeight / 2);
  }

  setZoomAt(nextZoom, focusX, focusY) {
    const scroller = this.currentScroller;
    const canvas = this.currentCanvas;
    if (!scroller || !canvas) return;
    const oldZoom = this.map.zoom || 1;
    nextZoom = Math.max(0.2, Math.min(2, nextZoom));
    if (Math.abs(nextZoom - oldZoom) < 0.001) return;
    const contentX = (scroller.scrollLeft + focusX) / oldZoom;
    const contentY = (scroller.scrollTop + focusY) / oldZoom;
    this.map.zoom = nextZoom;
    canvas.style.zoom = String(nextZoom);
    scroller.scrollLeft = contentX * nextZoom - focusX;
    scroller.scrollTop = contentY * nextZoom - focusY;
    this.map.scrollLeft = scroller.scrollLeft;
    this.map.scrollTop = scroller.scrollTop;
    this.updateToolbar();
    clearTimeout(this.zoomSaveTimer);
    this.zoomSaveTimer = setTimeout(() => this.saveMap(), 250);
  }

  promptForDecision() {
    if (this.promptOpen || this.map.rootId) return;
    this.promptOpen = true;
    const modal = new NodeEditorModal(this.app, {
      heading: "Enter the decision",
      type: "decision",
      isRoot: true,
      onSave: async ({ text }) => {
        const root = this.makeNode({ text, type: "decision", parentId: null, relationship: "" });
        this.map = { ...newMapWithDefaults(this.plugin.settings), rootId: root.id, selectedId: root.id, nodes: [root] };
        await this.saveMap();
        this.render();
      },
    });
    const originalClose = modal.onClose.bind(modal);
    modal.onClose = () => { originalClose(); this.promptOpen = false; };
    modal.open();
  }

  makeNode({ text, type, parentId, relationship, likelihood = 1, impact = 1, isConstraint = false, subOptionMode = "alternative" }) {
    return {
      id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      text,
      type,
      parentId,
      relationship,
      likelihood,
      impact,
      isConstraint,
      subOptionMode,
      childIds: [],
    };
  }

  getNode(id) { return this.map.nodes.find((node) => node.id === id); }

  rememberViewport() {
    this.map.scrollLeft = this.currentScroller?.scrollLeft ?? this.map.scrollLeft;
    this.map.scrollTop = this.currentScroller?.scrollTop ?? this.map.scrollTop;
  }

  installLongPress(element, action) {
    let timer = null;
    let pointerId = null;
    const cancel = () => { clearTimeout(timer); timer = null; pointerId = null; };
    this.longPressCancellers.add(cancel);
    element.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch") return;
      cancel();
      if (this.touchGestureMulti || this.touchPointers.size !== 1 || Date.now() < this.touchSuppressUntil) return;
      pointerId = event.pointerId;
      timer = setTimeout(() => {
        timer = null;
        if (this.touchGestureMoved || this.touchGestureMulti || this.touchPointers.size !== 1 || !this.touchPointers.has(pointerId)) return;
        this.touchSuppressUntil = Date.now() + 500;
        action(event);
        if (navigator.vibrate) navigator.vibrate(30);
      }, 600);
    });
    element.addEventListener("pointermove", (event) => {
      if (event.pointerId === pointerId && this.touchGestureMoved) cancel();
    });
    element.addEventListener("pointerup", cancel);
    element.addEventListener("pointercancel", cancel);
  }

  branchContains(root, candidateId) {
    if (!root) return false;
    if (root.id === candidateId) return true;
    return root.childIds.some((id) => this.branchContains(this.getNode(id), candidateId));
  }

  canAttach(node, parent) {
    if (!node || !parent || !node.parentId || node.id === parent.id) return false;
    if (!this.canAcceptType(node.type, parent)) return false;
    if (node.type === "option" && this.branchContains(node, parent.id)) return false;
    return true;
  }

  canAcceptType(type, parent) {
    if (!parent || (parent.type !== "decision" && parent.type !== "option")) return false;
    if (!["option", "benefit", "risk"].includes(type)) return false;
    return parent.type !== "decision" || type === "option";
  }

  async moveBranch(node, newParent) {
    if (!this.canAttach(node, newParent)) {
      new Notice("That node type cannot be placed there.");
      return;
    }
    if (node.parentId === newParent.id) return;
    this.rememberViewport();
    this.recordHistory();
    const oldParent = this.getNode(node.parentId);
    if (oldParent) oldParent.childIds = oldParent.childIds.filter((id) => id !== node.id);
    newParent.childIds.push(node.id);
    node.parentId = newParent.id;
    await this.saveMap();
    this.render();
  }

  copyBranch(node) {
    if (!node?.parentId) return;
    const copied = [];
    const collect = (current) => {
      if (!current) return;
      copied.push(JSON.parse(JSON.stringify(current)));
      current.childIds.forEach((id) => collect(this.getNode(id)));
    };
    collect(node);
    this.plugin.branchClipboard = { rootId: node.id, nodes: copied };
    new Notice(`Copied branch: ${node.text}`);
  }

  clipboardRoot() {
    const clipboard = this.plugin.branchClipboard;
    return clipboard?.nodes?.find((node) => node.id === clipboard.rootId) || null;
  }

  async pasteBranch(parent) {
    const clipboard = this.plugin.branchClipboard;
    const sourceRoot = this.clipboardRoot();
    if (!clipboard || !sourceRoot) return;
    if (!this.canAcceptType(sourceRoot.type, parent)) {
      new Notice("That copied branch cannot be placed there.");
      return;
    }
    this.rememberViewport();
    this.recordHistory();
    const idMap = new Map();
    for (const source of clipboard.nodes) {
      idMap.set(source.id, `node-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`);
    }
    const clones = clipboard.nodes.map((source) => ({
      ...JSON.parse(JSON.stringify(source)),
      id: idMap.get(source.id),
      parentId: source.id === clipboard.rootId ? parent.id : idMap.get(source.parentId),
      childIds: source.childIds.map((id) => idMap.get(id)).filter(Boolean),
    }));
    const pastedRoot = clones.find((node) => node.id === idMap.get(clipboard.rootId));
    this.map.nodes.push(...clones);
    parent.childIds.push(pastedRoot.id);
    this.map.selectedId = pastedRoot.id;
    await this.saveMap();
    this.render();
  }

  addChild(parent, suggestedType = null) {
    if (parent.type !== "decision" && parent.type !== "option") {
      new Notice("Benefits and risks are final scoring factors and cannot have children.");
      return;
    }
    const defaultType = suggestedType || (parent.type === "option" ? "benefit" : "option");
    new NodeEditorModal(this.app, {
      heading: "Add connected item",
      type: defaultType,
      subOptionMode: this.plugin.settings.defaultSubOptionMode,
      allowedTypes: parent.type === "decision" ? ["option"] : ["option", "benefit", "risk"],
      onSave: async (data) => {
        this.rememberViewport();
        this.recordHistory();
        const child = this.makeNode({ ...data, parentId: parent.id });
        this.map.nodes.push(child);
        parent.childIds.push(child.id);
        await this.saveMap();
        this.render();
      },
    }).open();
  }

  editNode(node) {
    const parent = this.getNode(node.parentId);
    const allowedTypes = !node.parentId
      ? ["decision"]
      : (parent?.type === "decision" || node.childIds.length ? ["option"] : ["option", "benefit", "risk"]);
    new NodeEditorModal(this.app, {
      heading: node.parentId ? "Edit item" : "Edit decision",
      text: node.text,
      type: node.type,
      relationship: node.relationship,
      likelihood: node.likelihood,
      impact: node.impact,
      isConstraint: node.isConstraint,
      subOptionMode: node.subOptionMode,
      hasSubOptions: node.childIds.some((id) => this.getNode(id)?.type === "option"),
      isRoot: !node.parentId,
      allowedTypes,
      onSave: async (data) => {
        this.rememberViewport();
        this.recordHistory();
        Object.assign(node, data);
        await this.saveMap();
        this.render();
      },
    }).open();
  }

  editRelationship(node) {
    new RelationshipModal(this.app, node.relationship, async (value) => {
      this.recordHistory();
      node.relationship = value;
      await this.saveMap();
      this.render();
    }).open();
  }

  showNodeMenu(event, node) {
    event.preventDefault();
    if (this.map.selectedId !== node.id) {
      this.map.selectedId = node.id;
      this.updateSelectionStyles();
      this.renderSummaryContent();
      this.saveMap();
    }
    this.activeMenu?.hide?.();
    const menu = new Menu();
    this.activeMenu = menu;
    if (node.type === "decision" || node.type === "option") {
      menu.addItem((item) => item.setTitle("Add connected item").setIcon("plus").onClick(() => this.addChild(node)));
    }
    menu.addItem((item) => item.setTitle("Edit node").setIcon("pencil").onClick(() => this.editNode(node)));
    if (node.parentId) {
      menu.addSeparator();
      menu.addItem((item) => item.setTitle("Copy branch").setIcon("copy").onClick(() => this.copyBranch(node)));
      menu.addItem((item) => {
        item.setTitle("Move branch to…").setIcon("move");
        const submenu = item.setSubmenu();
        const destinations = this.map.nodes.filter((candidate) => this.canAttach(node, candidate) && candidate.id !== node.parentId);
        if (!destinations.length) submenu.addItem((subitem) => subitem.setTitle("No valid destination").setDisabled(true));
        for (const destination of destinations) {
          submenu.addItem((subitem) => subitem
            .setTitle(`${NODE_TYPES[destination.type]?.label || destination.type}: ${destination.text}`)
            .onClick(() => this.moveBranch(node, destination)));
        }
      });
    }
    const clipboardRoot = this.clipboardRoot();
    if (clipboardRoot) {
      if (this.canAcceptType(clipboardRoot.type, node)) {
        menu.addItem((item) => item.setTitle(`Paste “${clipboardRoot.text}” here`).setIcon("clipboard-paste").onClick(() => this.pasteBranch(node)));
      }
    }
    if (node.parentId) {
      menu.addItem((item) => item.setTitle("Delete this branch").setIcon("trash-2").onClick(() => this.deleteBranch(node)));
    }
    menu.showAtMouseEvent(event);
  }

  async deleteBranch(node) {
    if (this.plugin.settings.confirmDelete && !window.confirm(`Delete “${node.text}” and everything beneath it? This can be undone.`)) return;
    this.rememberViewport();
    this.recordHistory();
    const ids = new Set();
    const collect = (current) => {
      ids.add(current.id);
      for (const childId of current.childIds) {
        const child = this.getNode(childId);
        if (child) collect(child);
      }
    };
    collect(node);
    const parent = this.getNode(node.parentId);
    if (parent) parent.childIds = parent.childIds.filter((id) => id !== node.id);
    this.map.nodes = this.map.nodes.filter((item) => !ids.has(item.id));
    await this.saveMap();
    this.render();
  }

  visibleChildren(node) {
    const sideOrder = { benefit: 0, option: 1, risk: 2 };
    return node.childIds
      .map((id) => this.getNode(id))
      .filter(Boolean)
      .sort((a, b) => (sideOrder[a.type] ?? 1) - (sideOrder[b.type] ?? 1));
  }

  handleShortcut(event) {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLButtonElement || target.closest?.("[contenteditable=true]")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      event.preventDefault();
      if (event.shiftKey) this.redo();
      else this.undo();
      return;
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "y") {
      event.preventDefault();
      this.redo();
      return;
    }
    if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key) && !(event.ctrlKey || event.metaKey || event.altKey)) {
      event.preventDefault();
      this.navigateSelection(event.key);
      return;
    }
    const selected = this.getNode(this.map.selectedId);
    if (!selected) return;
    if (event.key === "Enter") {
      event.preventDefault();
      this.editNode(selected);
    } else if (event.key === "Tab") {
      event.preventDefault();
      if (selected.type === "decision" || selected.type === "option") this.addChild(selected, "option");
    } else if (event.key.toLowerCase() === "d" && selected.type === "option") {
      event.preventDefault();
      this.addChild(selected, "risk");
    } else if (event.key.toLowerCase() === "b" && selected.type === "option") {
      event.preventDefault();
      this.addChild(selected, "benefit");
    } else if (event.key === "Delete" && selected.parentId) {
      event.preventDefault();
      this.deleteBranch(selected);
    }
  }

  scoreForNode(node) {
    if (node.type !== "benefit" && node.type !== "risk") return null;
    const likelihood = Math.min(5, Math.max(1, Number(node.likelihood) || 1));
    const impact = Math.min(5, Math.max(1, Number(node.impact) || 1));
    return likelihood * impact;
  }

  normalizedDecisionScore(benefits, risks, ratedFactors) {
    return ratedFactors > 0
      ? Math.round(((benefits - risks) / (ratedFactors * 25)) * 100)
      : null;
  }

  scoreDescription(score) {
    if (score === null || score === undefined) return "Not rated";
    if (score >= 20) return "Favorable";
    if (score >= 5) return "Slightly favorable";
    if (score > -5) return "Balanced";
    if (score > -20) return "Slightly unfavorable";
    return "Unfavorable";
  }

  decisionNeedsMoreInfo(options) {
    return !options.some((entry) => entry.totals.score !== null && entry.totals.score !== undefined && !entry.totals.disqualified);
  }

  compareTotals(a, b) {
    if (Boolean(a.disqualified) !== Boolean(b.disqualified)) return a.disqualified ? -1 : 1;
    return (a.score ?? -Infinity) - (b.score ?? -Infinity)
      || a.net - b.net
      || a.rated - b.rated;
  }

  totalsForOption(node, ancestry = new Set()) {
    if (node.type !== "option") return null;
    if (ancestry.has(node.id)) return null;
    const path = new Set(ancestry);
    path.add(node.id);
    let benefits = 0;
    let risks = 0;
    let rated = 0;
    let unrated = 0;
    let factors = 0;
    let highestRisk = null;
    let disqualifyingRisk = null;
    const childOptions = [];

    for (const childId of node.childIds) {
      const child = this.getNode(childId);
      if (!child) continue;
      if (child.type === "option") {
        const childTotals = this.totalsForOption(child, path);
        if (childTotals) childOptions.push({ node: child, totals: childTotals });
        continue;
      }
      if (child.type !== "benefit" && child.type !== "risk") continue;
      factors += 1;
      const factorScore = this.scoreForNode(child);
      if (factorScore === null) {
        unrated += 1;
      } else {
        rated += 1;
        if (child.type === "benefit") benefits += factorScore;
        else {
          risks += factorScore;
          if (!highestRisk || factorScore > highestRisk.score) highestRisk = { score: factorScore, text: child.text };
        }
      }
      if (child.type === "risk" && child.isConstraint) disqualifyingRisk = { id: child.id, text: child.text };
    }

    const allRated = rated + childOptions.reduce((sum, entry) => sum + (entry.totals.allRated ?? entry.totals.rated), 0);
    const allUnrated = unrated + childOptions.reduce((sum, entry) => sum + (entry.totals.allUnrated ?? entry.totals.unrated), 0);
    const subOptionMode = node.subOptionMode === "combined" ? "combined" : "alternative";
    let chosen = null;
    let combinedOptions = null;

    if (subOptionMode === "combined") {
      combinedOptions = childOptions.map((entry) => ({ id: entry.node.id, text: entry.node.text }));
      for (const entry of childOptions) {
        benefits += entry.totals.benefits;
        risks += entry.totals.risks;
        rated += entry.totals.rated;
        unrated += entry.totals.unrated;
        factors += entry.totals.rated + entry.totals.unrated;
        if (entry.totals.highestRisk && (!highestRisk || entry.totals.highestRisk.score > highestRisk.score)) highestRisk = entry.totals.highestRisk;
        if (!disqualifyingRisk && entry.totals.disqualifyingRisk) disqualifyingRisk = entry.totals.disqualifyingRisk;
      }
    } else {
      for (const entry of childOptions) {
        const combinedBenefits = benefits + entry.totals.benefits;
        const combinedRisks = risks + entry.totals.risks;
        entry.combinedTotals = {
          score: this.normalizedDecisionScore(combinedBenefits, combinedRisks, rated + entry.totals.rated),
          net: combinedBenefits - combinedRisks,
          rated: rated + entry.totals.rated,
          disqualified: Boolean(disqualifyingRisk || entry.totals.disqualified),
        };
      }
      childOptions.sort((a, b) => this.compareTotals(b.combinedTotals, a.combinedTotals));
      chosen = childOptions.find((entry) => entry.combinedTotals.rated > 0) || childOptions[0] || null;
      if (chosen) {
        benefits += chosen.totals.benefits;
        risks += chosen.totals.risks;
        rated += chosen.totals.rated;
        unrated += chosen.totals.unrated;
        factors += chosen.totals.rated + chosen.totals.unrated;
        if (chosen.totals.highestRisk && (!highestRisk || chosen.totals.highestRisk.score > highestRisk.score)) highestRisk = chosen.totals.highestRisk;
        if (!disqualifyingRisk && chosen.totals.disqualifyingRisk) disqualifyingRisk = chosen.totals.disqualifyingRisk;
      }
    }
    if (!factors && !allUnrated) return null;
    const totalWeight = benefits + risks;
    return {
      benefits,
      risks,
      net: benefits - risks,
      score: this.normalizedDecisionScore(benefits, risks, rated),
      benefitPercent: totalWeight ? Math.round((benefits / totalWeight) * 100) : null,
      rated,
      unrated,
      allRated,
      allUnrated,
      highestRisk,
      disqualified: Boolean(disqualifyingRisk),
      disqualifyingRisk,
      chosenOption: chosen ? { id: chosen.node.id, text: chosen.node.text } : null,
      combinedOptions,
      subOptionMode,
    };
  }

  totalsForDecision() {
    const root = this.getNode(this.map.rootId);
    const options = (root?.childIds || [])
      .map((id) => this.getNode(id))
      .filter((node) => node?.type === "option")
      .map((node) => ({ node, totals: this.totalsForOption(node) }))
      .filter((entry) => entry.totals)
      .sort((a, b) => this.compareTotals(b.totals, a.totals));
    const winner = options.find((entry) => entry.totals.rated > 0 && !entry.totals.disqualified && entry.totals.score !== null);
    if (!winner) return null;
    const tiedOptions = options
      .filter((entry) => !entry.totals.disqualified && entry.totals.score === winner.totals.score)
      .map((entry) => ({ id: entry.node.id, text: entry.node.text }));
    return {
      ...winner.totals,
      allRated: options.reduce((sum, entry) => sum + (entry.totals.allRated ?? entry.totals.rated), 0),
      allUnrated: options.reduce((sum, entry) => sum + (entry.totals.allUnrated ?? entry.totals.unrated), 0),
      chosenOption: { id: winner.node.id, text: winner.node.text },
      tiedOptions,
    };
  }

  showBackgroundMenu(event) {
    event.preventDefault();
    this.activeMenu?.hide?.();
    const menu = new Menu();
    this.activeMenu = menu;
    menu.addItem((item) => {
      item.setTitle("Layout").setIcon("layout-template");
      const submenu = item.setSubmenu();
      const layouts = [
        ["right", "Right-facing"],
        ["left", "Left-facing"],
        ["up", "Top-facing"],
        ["down", "Bottom-facing"],
      ];
      for (const [value, label] of layouts) {
        submenu.addItem((subitem) => subitem
          .setTitle(`${this.map.layout === value ? "✓ " : ""}${label}`)
          .onClick(async () => {
            this.recordHistory();
            this.map.layout = value;
            this.map.scrollLeft = null;
            this.map.scrollTop = null;
            await this.saveMap();
            this.render();
          }));
      }
    });
    menu.addItem((item) => {
      item.setTitle("Background").setIcon("sun-moon");
      const submenu = item.setSubmenu();
      for (const [value, label] of [["dark", "Dark"], ["light", "Light"]]) {
        submenu.addItem((subitem) => subitem
          .setTitle(`${(this.map.background || "dark") === value ? "✓ " : ""}${label}`)
          .onClick(async () => {
            this.map.background = value;
            await this.saveMap();
            this.render();
          }));
      }
    });
    menu.addSeparator();
    menu.addItem((item) => {
      item.setTitle("Export").setIcon("download");
      const submenu = item.setSubmenu();
      submenu.addItem((subitem) => subitem.setTitle("Markdown report").onClick(() => this.exportMarkdown()));
      submenu.addItem((subitem) => subitem.setTitle("JSON backup").onClick(() => this.exportJson()));
      submenu.addSeparator();
      submenu.addItem((subitem) => subitem.setTitle("SVG image").onClick(() => this.exportSvg()));
      submenu.addItem((subitem) => subitem.setTitle("JPG image").onClick(() => this.exportJpg()));
      submenu.addItem((subitem) => subitem.setTitle("PDF document").onClick(() => this.exportPdf()));
    });
    menu.addItem((item) => item
      .setTitle("Import JSON backup")
      .setIcon("upload")
      .onClick(() => this.importJson()));
    menu.showAtMouseEvent(event);
  }

  markdownText(value) {
    return String(value ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, " ").trim();
  }

  optionTotalsMarkdown(totals, indent) {
    const pad = "  ".repeat(indent);
    if (!totals) return [`${pad}- Calculated score: Not enough rated information`];
    const rated = totals.allRated ?? totals.rated;
    const unrated = totals.allUnrated ?? totals.unrated;
    const lines = [
      `${pad}- Decision score: ${totals.score >= 0 ? "+" : ""}${totals.score} (range −100 to +100)`,
      `${pad}- Benefits: ${totals.benefits}`,
      `${pad}- Drawbacks: ${totals.risks}`,
      `${pad}- Net raw weight: ${totals.net >= 0 ? "+" : ""}${totals.net}`,
      `${pad}- Benefit share: ${totals.benefitPercent ?? "Not rated"}${totals.benefitPercent === null ? "" : "%"}`,
      `${pad}- Ratings completed: ${rated} of ${rated + unrated}`,
    ];
    if (totals.chosenOption) lines.push(`${pad}- Best path: ${this.markdownText(totals.chosenOption.text)}`);
    if (totals.combinedOptions?.length) lines.push(`${pad}- All Paths components: ${totals.combinedOptions.map((item) => this.markdownText(item.text)).join(", ")}`);
    if (totals.disqualifyingRisk) lines.push(`${pad}- Disqualified by deal-breaker: ${this.markdownText(totals.disqualifyingRisk.text)}`);
    if (totals.highestRisk) lines.push(`${pad}- Highest risk: −${totals.highestRisk.score} — ${this.markdownText(totals.highestRisk.text)}`);
    if (unrated) lines.push(`${pad}- Unrated factors: ${unrated}`);
    return lines;
  }

  buildMarkdownExport() {
    const root = this.getNode(this.map.rootId);
    const decisionTotals = this.totalsForDecision();
    const title = root?.text || "Decision map";
    const lines = [
      `# ${this.markdownText(title)}`,
      "",
      "## Decision summary",
      "",
      "Scores use `(benefits − risks) ÷ (rated factors × 25) × 100`. Benefits and risks use `likelihood × impact`. Option nodes specify whether sub-options use a Single Path or All Paths. Deal-breaker risks disqualify their path.",
      "",
    ];
    if (decisionTotals) {
      if (decisionTotals.tiedOptions?.length > 1) lines.push(`- Result: Tie — ${decisionTotals.tiedOptions.map((item) => this.markdownText(item.text)).join(", ")}`);
      else lines.push(`- Current leading option: ${this.markdownText(decisionTotals.chosenOption?.text || "None")}`);
      lines.push(...this.optionTotalsMarkdown(decisionTotals, 0));
    } else {
      lines.push("- Recommendation: Not enough rated information");
    }

    lines.push("", "## Options and factors", "");
    const visited = new Set();
    const writeNode = (node, depth) => {
      if (!node || visited.has(node.id)) return;
      visited.add(node.id);
      const pad = "  ".repeat(depth);
      const type = NODE_TYPES[node.type]?.label || node.type;
      lines.push(`${pad}- **${type}:** ${this.markdownText(node.text)}`);
      if (node.parentId) lines.push(`${pad}  - Connection label: ${this.markdownText(node.relationship || DEFAULT_RELATIONSHIPS[node.type] || "Related to")}`);
      if (node.type === "benefit" || node.type === "risk") {
        const factorScore = this.scoreForNode(node);
        lines.push(`${pad}  - Likelihood: ${node.likelihood}`);
        lines.push(`${pad}  - Impact: ${node.impact}`);
        if (node.type === "risk") lines.push(`${pad}  - Deal-breaker: ${node.isConstraint ? "Yes" : "No"}`);
        lines.push(`${pad}  - Factor score: ${factorScore === null ? "Unrated" : `${node.type === "benefit" ? "+" : "−"}${factorScore}`}`);
      } else if (node.type === "option") {
        lines.push(`${pad}  - Sub-option handling: ${node.subOptionMode === "combined" ? "All Paths" : "Single Path"}`);
        lines.push(...this.optionTotalsMarkdown(this.totalsForOption(node), depth + 1));
      } else if (node.type === "decision") {
        lines.push(...this.optionTotalsMarkdown(decisionTotals, depth + 1));
      }

      for (const childId of node.childIds || []) writeNode(this.getNode(childId), depth + 1);
    };
    writeNode(root, 0);

    lines.push("", "---", "", `Report created ${new Date().toLocaleString()}.`, "");
    return lines.join("\n");
  }

  async exportMarkdown() {
    const root = this.getNode(this.map.rootId);
    if (!root) return;
    const markdown = this.buildMarkdownExport();
    if (this.map.nodes.some((node) => !markdown.includes(this.markdownText(node.text)))) {
      new Notice("Export stopped because the report could not be verified.");
      return;
    }
    if (await this.saveExportFile(markdown, `${this.exportBaseName()}.md`, "text/markdown", "Markdown", ["md"])) {
      new Notice("Markdown report exported.");
    }
  }

  exportBaseName() {
    const root = this.getNode(this.map.rootId);
    return (root?.text || "decision-map")
      .replace(/[<>:"/\\|?*\x00-\x1F]/g, "")
      .replace(/[. ]+$/g, "")
      .trim()
      .slice(0, 60) || "decision-map";
  }

  async saveExportFile(data, suggestedName, mime, label, extensions) {
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime });
    try {
      if (typeof window.showSaveFilePicker === "function") {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: `${label} file`, accept: { [mime]: extensions.map((extension) => `.${extension}`) } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      }
    } catch (error) {
      if (error?.name === "AbortError") return false;
    }

    try {
      const electron = require("electron");
      const dialog = electron.remote?.dialog;
      const currentWindow = electron.remote?.getCurrentWindow?.();
      if (dialog) {
        const result = await dialog.showSaveDialog(currentWindow, {
          title: `Export decision as ${label}`,
          defaultPath: suggestedName,
          filters: [{ name: label, extensions }],
        });
        if (result.canceled || !result.filePath) return false;
        const bytes = Buffer.from(await blob.arrayBuffer());
        await require("fs").promises.writeFile(result.filePath, bytes);
        return true;
      }
    } catch (error) {
      console.error(`Decision Helper ${label} export failed`, error);
    }

    try {
      const file = new File([blob], suggestedName, { type: mime });
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ files: [file], title: suggestedName });
        return true;
      }
    } catch (error) {
      if (error?.name === "AbortError") return false;
    }

    try {
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = suggestedName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      return true;
    } catch (error) {
      console.error(`Decision Helper ${label} download failed`, error);
      new Notice("This device could not open a save or share dialog.");
      return false;
    }
  }

  buildJsonExport() {
    return JSON.stringify({
      ksdhBackupFormat: 1,
      dataFormat: FORMAT_VERSION,
      pluginId: "kempfs-simple-decision-helper",
      exportedAt: new Date().toISOString(),
      map: { ...this.map, formatVersion: FORMAT_VERSION },
    }, null, 2);
  }

  validateImportedMap(candidate) {
    const parsed = JSON.parse(JSON.stringify(candidate));
    if (!parsed?.rootId || !Array.isArray(parsed.nodes) || !parsed.nodes.length) throw new Error("Decision structure is missing");
    const ids = new Set(parsed.nodes.map((node) => node?.id));
    if (ids.has(undefined) || ids.size !== parsed.nodes.length) throw new Error("Decision structure is invalid");
    const decisions = parsed.nodes.filter((node) => node.type === "decision");
    const root = parsed.nodes.find((node) => node.id === parsed.rootId);
    if (!root || root.type !== "decision" || decisions.length !== 1) throw new Error("Decision structure is invalid: a backup must contain exactly one Decision node");
    const byId = new Map(parsed.nodes.map((node) => [node.id, node]));
    for (const node of parsed.nodes) {
      if (!NODE_TYPES[node.type] || !Array.isArray(node.childIds) || new Set(node.childIds).size !== node.childIds.length || node.childIds.some((id) => !ids.has(id))) {
        throw new Error("A node or connection is invalid");
      }
      if ((node.type === "benefit" || node.type === "risk") && node.childIds.length) throw new Error("A scoring factor cannot contain child nodes");
      if (node.id === parsed.rootId) {
        node.parentId = null;
      } else {
        const parent = byId.get(node.parentId);
        if (!parent || !parent.childIds.includes(node.id) || (parent.type !== "decision" && parent.type !== "option") || (parent.type === "decision" && node.type !== "option") || node.type === "decision") {
          throw new Error("A parent connection is invalid");
        }
      }
      for (const childId of node.childIds) {
        if (byId.get(childId)?.parentId !== node.id) throw new Error("A parent connection is invalid");
      }
    }
    const visited = new Set();
    const visiting = new Set();
    const walk = (node) => {
      if (visiting.has(node.id)) throw new Error("The imported tree contains a circular branch");
      if (visited.has(node.id)) return;
      visiting.add(node.id);
      node.childIds.forEach((id) => walk(byId.get(id)));
      visiting.delete(node.id);
      visited.add(node.id);
    };
    walk(root);
    if (visited.size !== parsed.nodes.length) throw new Error("The imported tree contains disconnected nodes");
    return { ...emptyMap(), ...parsed, formatVersion: FORMAT_VERSION };
  }

  parseJsonImport(json) {
    const backup = JSON.parse(json);
    if (backup?.ksdhBackupFormat !== 1 || (backup.pluginId && backup.pluginId !== "kempfs-simple-decision-helper") || !backup.map) {
      throw new Error("This is not a Decision Helper JSON backup");
    }
    return this.validateImportedMap(backup.map);
  }

  async exportJson() {
    if (await this.saveExportFile(this.buildJsonExport(), `${this.exportBaseName()}.json`, "application/json", "JSON backup", ["json"])) {
      new Notice("JSON backup exported.");
    }
  }

  async applyJsonImport(json) {
    let imported;
    try {
      imported = this.parseJsonImport(json);
    } catch (error) {
      new Notice(`Import failed: ${error.message}`);
      return;
    }
    if (!window.confirm("Replace this decision with the JSON backup? You can undo this change.")) return;
    this.rememberViewport();
    this.recordHistory();
    this.map = { ...imported, selectedId: imported.rootId, scrollLeft: null, scrollTop: null };
    this.unreadableData = null;
    this.loadError = null;
    await this.saveMap();
    this.render();
    new Notice("Decision restored from JSON backup.");
  }

  async importJson() {
    try {
      if (typeof window.showOpenFilePicker === "function") {
        const [handle] = await window.showOpenFilePicker({ types: [{ description: "Decision Helper JSON backup", accept: { "application/json": [".json"] } }], multiple: false });
        const file = await handle.getFile();
        await this.applyJsonImport(await file.text());
        return;
      }
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
    try {
      const electron = require("electron");
      const dialog = electron.remote?.dialog;
      const currentWindow = electron.remote?.getCurrentWindow?.();
      if (dialog) {
        const result = await dialog.showOpenDialog(currentWindow, { title: "Import Decision Helper JSON backup", properties: ["openFile"], filters: [{ name: "JSON", extensions: ["json"] }] });
        if (result.canceled || !result.filePaths?.[0]) return;
        await this.applyJsonImport(await require("fs").promises.readFile(result.filePaths[0], "utf8"));
        return;
      }
    } catch (error) {
      console.error("Decision Helper JSON import failed", error);
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json,application/json";
    input.addEventListener("change", async () => {
      const file = input.files?.[0];
      if (file) await this.applyJsonImport(await file.text());
    }, { once: true });
    input.click();
  }

  escapeXml(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
  }

  svgTextLines(value, maximum = 30, maximumLines = 3) {
    const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
    const lines = [];
    let line = "";
    for (const word of words) {
      const pieces = word.length > maximum ? word.match(new RegExp(`.{1,${maximum}}`, "g")) : [word];
      for (const piece of pieces) {
        const proposed = line ? `${line} ${piece}` : piece;
        if (proposed.length <= maximum) line = proposed;
        else {
          if (line) lines.push(line);
          line = piece;
        }
      }
    }
    if (line) lines.push(line);
    if (lines.length > maximumLines) {
      lines.length = maximumLines;
      lines[maximumLines - 1] = `${lines[maximumLines - 1].slice(0, Math.max(1, maximum - 1))}…`;
    }
    return lines.length ? lines : [""];
  }

  exportNodeScore(node) {
    if (node.type === "benefit" || node.type === "risk") {
      const score = this.scoreForNode(node);
      return score === null ? "Unrated" : `${node.isConstraint ? "DEAL-BREAKER · " : ""}${node.type === "benefit" ? "+" : "−"}${score} · L${node.likelihood} × I${node.impact}`;
    }
    const totals = node.type === "decision" ? this.totalsForDecision() : this.totalsForOption(node);
    if (!totals) return "Not evaluated";
    if (totals.disqualified) return "Blocked by deal-breaker";
    if (node.type === "decision") return totals.tiedOptions?.length > 1 ? "Tie" : `Leader: ${totals.chosenOption?.text || "None"} · ${totals.score >= 0 ? "+" : ""}${totals.score}`;
    return `Score ${totals.score >= 0 ? "+" : ""}${totals.score}`;
  }

  buildSvgExport() {
    const layout = this.calculateLayout();
    const entries = [...layout.positions.entries()];
    if (!entries.length) throw new Error("The decision map is empty");
    const exportCardHeight = 122;
    const margin = 70;
    const minX = Math.min(...entries.map(([, position]) => position.x));
    const minY = Math.min(...entries.map(([, position]) => position.y));
    const maxX = Math.max(...entries.map(([, position]) => position.x + CARD_WIDTH));
    const maxY = Math.max(...entries.map(([, position]) => position.y + exportCardHeight));
    const width = Math.ceil(maxX - minX + margin * 2);
    const height = Math.ceil(maxY - minY + margin * 2);
    const shifted = new Map(entries.map(([id, position]) => [id, { x: position.x - minX + margin, y: position.y - minY + margin }]));
    const wantsLight = this.map.background === "light" || (this.map.background === "system" && document.body?.classList?.contains("theme-light"));
    const palette = wantsLight
      ? { background: "#f6f7f9", card: "#ffffff", text: "#202124", muted: "#62666d", line: "#73777f", label: "#ffffff", border: "#c9ccd2" }
      : { background: "#17181b", card: "#242529", text: "#f0f1f3", muted: "#a9adb5", line: "#b8bbc1", label: "#202125", border: "#43464d" };
    const accents = { decision: "#7857ff", option: "#3b91c8", benefit: "#58a85d", risk: "#c85c5c" };
    const direction = this.map.layout || "down";
    const horizontal = direction === "left" || direction === "right";
    const parts = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
      `<rect width="100%" height="100%" fill="${palette.background}"/>`,
      `<g fill="none" stroke="${palette.line}" stroke-width="2">`,
    ];
    for (const node of this.map.nodes) {
      if (!node.parentId) continue;
      const parent = shifted.get(node.parentId);
      const child = shifted.get(node.id);
      if (!parent || !child) continue;
      let x1; let y1; let x2; let y2;
      if (direction === "up") { x1 = parent.x + CARD_WIDTH / 2; y1 = parent.y; x2 = child.x + CARD_WIDTH / 2; y2 = child.y + CARD_HEIGHT; }
      else if (direction === "right") { x1 = parent.x + CARD_WIDTH; y1 = parent.y + CARD_HEIGHT / 2; x2 = child.x; y2 = child.y + CARD_HEIGHT / 2; }
      else if (direction === "left") { x1 = parent.x; y1 = parent.y + CARD_HEIGHT / 2; x2 = child.x + CARD_WIDTH; y2 = child.y + CARD_HEIGHT / 2; }
      else { x1 = parent.x + CARD_WIDTH / 2; y1 = parent.y + CARD_HEIGHT; x2 = child.x + CARD_WIDTH / 2; y2 = child.y; }
      const middleX = x1 + (x2 - x1) / 2;
      const middleY = y1 + (y2 - y1) / 2;
      const path = horizontal
        ? `M ${x1} ${y1} C ${middleX} ${y1}, ${middleX} ${y2}, ${x2} ${y2}`
        : `M ${x1} ${y1} C ${x1} ${middleY}, ${x2} ${middleY}, ${x2} ${y2}`;
      parts.push(`<path d="${path}"/>`);
    }
    parts.push(`</g>`);
    for (const node of this.map.nodes) {
      if (!node.parentId) continue;
      const parent = shifted.get(node.parentId);
      const child = shifted.get(node.id);
      if (!parent || !child) continue;
      const label = node.relationship || DEFAULT_RELATIONSHIPS[node.type] || "Related";
      const x = (parent.x + child.x) / 2 + CARD_WIDTH / 2;
      const y = (parent.y + child.y) / 2 + CARD_HEIGHT / 2;
      const labelWidth = Math.min(190, Math.max(58, label.length * 6.5 + 18));
      parts.push(`<rect x="${x - labelWidth / 2}" y="${y - 12}" width="${labelWidth}" height="24" rx="12" fill="${palette.label}" stroke="${palette.border}"/>`);
      parts.push(`<text x="${x}" y="${y + 4}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="${palette.text}">${this.escapeXml(label.length > 26 ? `${label.slice(0, 25)}…` : label)}</text>`);
    }
    for (const node of this.map.nodes) {
      const position = shifted.get(node.id);
      if (!position) continue;
      const accent = accents[node.type] || accents.option;
      parts.push(`<g><title>${this.escapeXml(node.text)}</title>`);
      parts.push(`<rect x="${position.x}" y="${position.y}" width="${CARD_WIDTH}" height="${exportCardHeight}" rx="11" fill="${palette.card}" stroke="${node.isConstraint ? accents.risk : palette.border}" stroke-width="${node.type === "decision" ? 3 : 1.5}"/>`);
      parts.push(`<rect x="${position.x}" y="${position.y}" width="6" height="${exportCardHeight}" rx="3" fill="${accent}"/>`);
      parts.push(`<text x="${position.x + 18}" y="${position.y + 21}" font-family="sans-serif" font-size="10" font-weight="700" letter-spacing="1" fill="${accent}">${this.escapeXml(node.type === "risk" ? "DRAWBACK" : (NODE_TYPES[node.type]?.label || node.type).toUpperCase())}</text>`);
      const lines = this.svgTextLines(node.text);
      lines.forEach((line, index) => parts.push(`<text x="${position.x + CARD_WIDTH / 2}" y="${position.y + 48 + index * 17}" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="600" fill="${palette.text}">${this.escapeXml(line)}</text>`));
      parts.push(`<text x="${position.x + CARD_WIDTH / 2}" y="${position.y + 108}" text-anchor="middle" font-family="sans-serif" font-size="10" font-weight="600" fill="${node.type === "risk" ? accents.risk : (node.type === "benefit" ? accents.benefit : palette.muted)}">${this.escapeXml(this.exportNodeScore(node))}</text>`);
      parts.push(`</g>`);
    }
    parts.push(`</svg>`);
    return { svg: parts.join(""), width, height };
  }

  async exportSvg() {
    try {
      const { svg } = this.buildSvgExport();
      if (await this.saveExportFile(svg, `${this.exportBaseName()}.svg`, "image/svg+xml", "SVG", ["svg"])) new Notice("SVG exported.");
    } catch (error) {
      console.error("Decision Helper SVG export failed", error);
      new Notice("The SVG could not be created.");
    }
  }

  async svgToJpegBlob(svg, width, height) {
    const source = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(source);
    try {
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = url; });
      const scale = Math.max(1, Math.min(2, 8000 / Math.max(width, height)));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d");
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      return await new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("JPG encoding failed")), "image/jpeg", 0.92));
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async exportJpg() {
    try {
      const { svg, width, height } = this.buildSvgExport();
      const jpg = await this.svgToJpegBlob(svg, width, height);
      if (await this.saveExportFile(jpg, `${this.exportBaseName()}.jpg`, "image/jpeg", "JPG", ["jpg", "jpeg"])) new Notice("JPG exported.");
    } catch (error) {
      console.error("Decision Helper JPG export failed", error);
      new Notice("The JPG could not be created on this device.");
    }
  }

  async jpegToPdf(jpegBlob, pixelWidth, pixelHeight) {
    const jpeg = new Uint8Array(await jpegBlob.arrayBuffer());
    const landscape = pixelWidth >= pixelHeight;
    const pageWidth = landscape ? 792 : 612;
    const pageHeight = landscape ? 612 : 792;
    const margin = 24;
    const scale = Math.min((pageWidth - margin * 2) / pixelWidth, (pageHeight - margin * 2) / pixelHeight);
    const drawWidth = pixelWidth * scale;
    const drawHeight = pixelHeight * scale;
    const drawX = (pageWidth - drawWidth) / 2;
    const drawY = (pageHeight - drawHeight) / 2;
    const encoder = new TextEncoder();
    const content = `q\n${drawWidth.toFixed(3)} 0 0 ${drawHeight.toFixed(3)} ${drawX.toFixed(3)} ${drawY.toFixed(3)} cm\n/Im0 Do\nQ\n`;
    const objects = [
      encoder.encode("<< /Type /Catalog /Pages 2 0 R >>"),
      encoder.encode("<< /Type /Pages /Kids [3 0 R] /Count 1 >>"),
      encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`),
      { prefix: encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${pixelWidth} /Height ${pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), data: jpeg, suffix: encoder.encode("\nendstream") },
      encoder.encode(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`),
    ];
    const parts = [encoder.encode("%PDF-1.4\n%KSDH\n")];
    const offsets = [0];
    let length = parts[0].length;
    objects.forEach((object, index) => {
      offsets.push(length);
      const prefix = encoder.encode(`${index + 1} 0 obj\n`);
      const suffix = encoder.encode("\nendobj\n");
      parts.push(prefix); length += prefix.length;
      if (object.data) {
        parts.push(object.prefix, object.data, object.suffix);
        length += object.prefix.length + object.data.length + object.suffix.length;
      } else {
        parts.push(object); length += object.length;
      }
      parts.push(suffix); length += suffix.length;
    });
    const xrefOffset = length;
    let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    for (let index = 1; index <= objects.length; index += 1) xref += `${String(offsets[index]).padStart(10, "0")} 00000 n \n`;
    xref += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
    parts.push(encoder.encode(xref));
    return new Blob(parts, { type: "application/pdf" });
  }

  async exportPdf() {
    try {
      const { svg, width, height } = this.buildSvgExport();
      const jpg = await this.svgToJpegBlob(svg, width, height);
      const pdf = await this.jpegToPdf(jpg, Math.max(1, Math.round(width * Math.max(1, Math.min(2, 8000 / Math.max(width, height))))), Math.max(1, Math.round(height * Math.max(1, Math.min(2, 8000 / Math.max(width, height))))));
      if (await this.saveExportFile(pdf, `${this.exportBaseName()}.pdf`, "application/pdf", "PDF", ["pdf"])) new Notice("PDF exported.");
    } catch (error) {
      console.error("Decision Helper PDF export failed", error);
      new Notice("The PDF could not be created on this device.");
    }
  }

  calculateLayout() {
    const positions = new Map();
    const root = this.getNode(this.map.rootId);
    if (!root) return { positions, width: 760 + CANVAS_SPACE * 2, height: 520 + CANVAS_SPACE * 2 };

    const direction = this.map.layout || "down";
    const vertical = direction === "down" || direction === "up";
    const siblingPreset = this.map.siblingSpacing || "regular";
    const levelPreset = this.map.levelSpacing || "regular";
    const siblingGap = siblingPreset === "extended"
      ? 300
      : (siblingPreset === "compact" ? 24 : (vertical ? VERTICAL_SIBLING_GAP : HORIZONTAL_SIBLING_GAP));
    const levelGap = levelPreset === "extended"
      ? 300
      : (levelPreset === "compact" ? 55 : (vertical ? VERTICAL_LEVEL_GAP : HORIZONTAL_LEVEL_GAP));
    const crossStep = vertical
      ? CARD_WIDTH + siblingGap
      : CARD_HEIGHT + SCORE_FOOTER_HEIGHT + siblingGap;
    const depthStep = vertical
      ? CARD_HEIGHT + SCORE_FOOTER_HEIGHT + levelGap
      : CARD_WIDTH + levelGap;
    let leafIndex = 0;

    const place = (node, depth) => {
      const children = this.visibleChildren(node);
      let cross;
      if (!children.length) {
        cross = leafIndex * crossStep;
        leafIndex += 1;
      } else {
        const hasBenefit = children.some((child) => child.type === "benefit");
        const hasRisk = children.some((child) => child.type === "risk");
        const boundaries = [];
        if (hasRisk && !hasBenefit) {
          boundaries.push(leafIndex * crossStep);
          leafIndex += 1;
        }
        boundaries.push(...children.map((child) => place(child, depth + 1)));
        if (hasBenefit && !hasRisk) {
          boundaries.push(leafIndex * crossStep);
          leafIndex += 1;
        }
        cross = (boundaries[0] + boundaries[boundaries.length - 1]) / 2;
      }

      const signedDepth = (direction === "up" || direction === "left" ? -1 : 1) * depth * depthStep;
      const centerX = vertical ? cross : signedDepth;
      const centerY = vertical ? signedDepth : cross;
      positions.set(node.id, {
        x: centerX - CARD_WIDTH / 2,
        y: centerY - CARD_HEIGHT / 2,
      });
      return cross;
    };

    place(root, 0);

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const position of positions.values()) {
      minX = Math.min(minX, position.x);
      minY = Math.min(minY, position.y);
      maxX = Math.max(maxX, position.x + CARD_WIDTH);
      maxY = Math.max(maxY, position.y + CARD_HEIGHT + SCORE_FOOTER_HEIGHT);
    }

    const contentWidth = Math.max(760, maxX - minX + TREE_MARGIN * 2);
    const contentHeight = Math.max(520, maxY - minY + TREE_MARGIN * 2);
    const offsetX = CANVAS_SPACE + (contentWidth - (maxX - minX)) / 2 - minX;
    const offsetY = CANVAS_SPACE + (contentHeight - (maxY - minY)) / 2 - minY;
    for (const position of positions.values()) {
      position.x += offsetX;
      position.y += offsetY;
    }

    return {
      positions,
      width: contentWidth + CANVAS_SPACE * 2,
      height: contentHeight + CANVAS_SPACE * 2,
    };
  }

  drawEdges(svg, positions) {
    for (const node of this.map.nodes) {
      if (!node.parentId) continue;
      const parent = positions.get(node.parentId);
      const child = positions.get(node.id);
      if (!parent || !child) continue;

      const direction = this.map.layout || "down";
      let x1;
      let y1;
      let x2;
      let y2;
      if (direction === "up") {
        x1 = parent.x + CARD_WIDTH / 2; y1 = parent.y;
        x2 = child.x + CARD_WIDTH / 2; y2 = child.y + CARD_HEIGHT;
      } else if (direction === "right") {
        x1 = parent.x + CARD_WIDTH; y1 = parent.y + CARD_HEIGHT / 2;
        x2 = child.x; y2 = child.y + CARD_HEIGHT / 2;
      } else if (direction === "left") {
        x1 = parent.x; y1 = parent.y + CARD_HEIGHT / 2;
        x2 = child.x + CARD_WIDTH; y2 = child.y + CARD_HEIGHT / 2;
      } else {
        x1 = parent.x + CARD_WIDTH / 2; y1 = parent.y + CARD_HEIGHT;
        x2 = child.x + CARD_WIDTH / 2; y2 = child.y;
      }
      const horizontal = direction === "right" || direction === "left";
      const middleX = x1 + (x2 - x1) / 2;
      const middleY = y1 + (y2 - y1) / 2;
      svg.createSvg("path", {
        attr: {
          class: "kdh-line",
          d: horizontal
            ? `M ${x1} ${y1} C ${middleX} ${y1}, ${middleX} ${y2}, ${x2} ${y2}`
            : `M ${x1} ${y1} C ${x1} ${middleY}, ${x2} ${middleY}, ${x2} ${y2}`,
        },
      });

      const label = node.relationship || DEFAULT_RELATIONSHIPS[node.type] || NODE_TYPES[node.type]?.label || "Related";
      const shownLabel = label.length > 26 ? `${label.slice(0, 25)}…` : label;
      const labelX = middleX;
      const labelY = middleY - 5;
      const labelWidth = Math.max(62, Math.min(190, shownLabel.length * 6.5 + 20));
      const group = svg.createSvg("g", { attr: { class: "kdh-edge-label", "data-node-id": node.id } });
      group.createSvg("rect", { attr: { x: String(labelX - labelWidth / 2), y: String(labelY - 13), width: String(labelWidth), height: "23", rx: "11" } });
      group.createSvg("text", { attr: { x: String(labelX), y: String(labelY + 2), "text-anchor": "middle" } }).setText(shownLabel);
      group.addEventListener("dblclick", () => this.editRelationship(node));
    }
  }

  drawNodes(canvas, positions) {
    for (const node of this.map.nodes) {
      const position = positions.get(node.id);
      if (!position) continue;
      const typeClass = NODE_TYPES[node.type]?.color || "option";
      const selectedClass = node.id === this.map.selectedId ? " is-selected" : "";
      const dealBreakerClass = node.type === "risk" && node.isConstraint ? " is-deal-breaker" : "";
      const card = canvas.createDiv({ cls: `kdh-node kdh-type-${typeClass}${dealBreakerClass}${selectedClass}` });
      card.dataset.nodeId = node.id;
      card.setAttribute("aria-selected", node.id === this.map.selectedId ? "true" : "false");
      card.draggable = Boolean(node.parentId);
      card.style.left = `${position.x}px`;
      card.style.top = `${position.y}px`;
      card.createDiv({ cls: "kdh-node-type", text: NODE_TYPES[node.type]?.label || node.type });
      card.createDiv({ cls: "kdh-node-text", text: node.text });

      const factorScore = this.scoreForNode(node);
      if (this.map.showScoreLabels !== false && (node.type === "benefit" || node.type === "risk")) {
        card.createDiv({
          cls: `kdh-factor-score kdh-factor-score-${node.type}${factorScore === null ? " is-unrated" : ""}${node.isConstraint ? " is-constraint" : ""}`,
          text: factorScore === null ? "Unrated" : `${node.isConstraint ? "BLOCK · " : ""}${node.type === "benefit" ? "+" : "−"}${factorScore} · Likely ${node.likelihood} · Impact ${node.impact}`,
          attr: { "aria-label": factorScore === null ? "Likelihood or impact has not been rated" : `Likelihood ${node.likelihood} times impact ${node.impact}` },
        });
      }
      if (node.type === "risk" && node.isConstraint) {
        const badge = card.createDiv({ cls: "kdh-deal-breaker-badge" });
        const icon = badge.createSpan({ cls: "kdh-deal-breaker-icon" });
        setIcon(icon, "octagon-x");
        badge.createSpan({ text: "Deal-breaker" });
      }

      if (node.type === "option" && node.childIds.some((id) => this.getNode(id)?.type === "option")) {
        const combined = node.subOptionMode === "combined";
        const badge = card.createDiv({ cls: `kdh-suboption-mode${combined ? " is-combined" : " is-alternative"}` });
        const icon = badge.createSpan({ cls: "kdh-suboption-mode-icon" });
        setIcon(icon, combined ? "combine" : "git-fork");
        badge.createSpan({ text: combined ? "All Paths" : "Single Path" });
      }

      const totals = node.type === "decision"
        ? this.totalsForDecision()
        : (node.type === "option" ? this.totalsForOption(node) : null);
      if (this.map.showScoreLabels !== false && (totals || node.type === "decision")) {
        const scoreBox = card.createDiv({ cls: "kdh-option-score" });
        if (node.type === "decision") {
          const options = this.rankedTopLevelOptions();
          const needsMoreInfo = this.decisionNeedsMoreInfo(options);
          const tied = totals?.tiedOptions || [];
          scoreBox.createDiv({ cls: `kdh-simple-score${needsMoreInfo ? " is-incomplete" : ""}`, text: needsMoreInfo ? "Not evaluated" : (tied.length > 1 ? `Tie: ${tied.map((item) => item.text).join(" · ")}` : `Current leader: ${totals.chosenOption?.text || "None"}`) });
          if (!needsMoreInfo) scoreBox.createDiv({ cls: `kdh-simple-score-detail${totals.score < 0 ? " is-negative" : ""}`, text: `${this.scoreDescription(totals.score)} · ${totals.score >= 0 ? "+" : ""}${totals.score}` });
        } else if (totals.disqualified) {
          scoreBox.createDiv({ cls: "kdh-simple-score is-blocked", text: `Blocked: ${totals.disqualifyingRisk?.text || "deal-breaker risk"}` });
        } else {
          scoreBox.createDiv({ cls: `kdh-simple-score${totals.score < 0 ? " is-negative" : ""}`, text: `${this.scoreDescription(totals.score)} · ${totals.score >= 0 ? "+" : ""}${totals.score}` });
        }
      }

      if (node.type === "decision" || node.type === "option") {
        const add = card.createEl("button", { cls: "kdh-add-child clickable-icon", attr: { "aria-label": "Add connected item" } });
        setIcon(add, "plus");
        add.addEventListener("click", (event) => { event.stopPropagation(); this.addChild(node); });
      }

      card.addEventListener("dblclick", () => this.editNode(node));
      this.installLongPress(card, (event) => this.showNodeMenu(event, node));
      card.addEventListener("dragstart", (event) => {
        if (!node.parentId || event.target.closest("button")) {
          event.preventDefault();
          return;
        }
        this.plugin.draggedNodeId = node.id;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", node.id);
        card.addClass("is-dragging");
      });
      card.addEventListener("dragend", () => {
        this.plugin.draggedNodeId = null;
        card.removeClass("is-dragging");
        canvas.querySelectorAll(".kdh-node.is-drop-target").forEach((element) => element.removeClass("is-drop-target"));
      });
      card.addEventListener("dragover", (event) => {
        const dragged = this.getNode(this.plugin.draggedNodeId || event.dataTransfer.getData("text/plain"));
        if (!this.canAttach(dragged, node) || dragged.parentId === node.id) return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        card.addClass("is-drop-target");
      });
      card.addEventListener("dragleave", () => card.removeClass("is-drop-target"));
      card.addEventListener("drop", (event) => {
        event.preventDefault();
        card.removeClass("is-drop-target");
        const dragged = this.getNode(this.plugin.draggedNodeId || event.dataTransfer.getData("text/plain"));
        if (dragged) this.moveBranch(dragged, node);
      });
      card.addEventListener("click", () => {
        this.map.scrollLeft = this.currentScroller?.scrollLeft ?? this.map.scrollLeft;
        this.map.scrollTop = this.currentScroller?.scrollTop ?? this.map.scrollTop;
        this.selectNode(node, false);
      });
      card.addEventListener("contextmenu", (event) => this.showNodeMenu(event, node));
    }
  }

  installNavigation(scroller, canvas) {
    this.currentScroller = scroller;
    const trackTouchStart = (event) => {
      if (event.pointerType !== "touch") return;
      if (this.touchPointers.size === 0) {
        this.touchGestureMoved = false;
        this.touchGestureMulti = false;
      }
      this.touchPointers.set(event.pointerId, {
        startX: event.clientX,
        startY: event.clientY,
        x: event.clientX,
        y: event.clientY,
      });
      if (this.touchPointers.size > 1) {
        this.touchGestureMulti = true;
        this.longPressCancellers.forEach((cancel) => cancel());
      }
    };
    const trackTouchMove = (event) => {
      if (event.pointerType !== "touch") return;
      const point = this.touchPointers.get(event.pointerId);
      if (!point) return;
      point.x = event.clientX;
      point.y = event.clientY;
      if (Math.hypot(point.x - point.startX, point.y - point.startY) > 8) {
        this.touchGestureMoved = true;
        this.longPressCancellers.forEach((cancel) => cancel());
      }
    };
    const trackTouchEnd = (event) => {
      if (event.pointerType !== "touch") return;
      this.touchPointers.delete(event.pointerId);
      if (this.touchGestureMoved || this.touchGestureMulti) this.touchSuppressUntil = Date.now() + 500;
      if (this.touchPointers.size === 0) {
        const gestureEndedAt = this.touchSuppressUntil;
        setTimeout(() => {
          if (this.touchPointers.size === 0 && this.touchSuppressUntil === gestureEndedAt) {
            this.touchGestureMoved = false;
            this.touchGestureMulti = false;
          }
        }, 520);
      }
    };
    scroller.addEventListener("pointerdown", trackTouchStart, true);
    scroller.addEventListener("pointermove", trackTouchMove, true);
    scroller.addEventListener("pointerup", trackTouchEnd, true);
    scroller.addEventListener("pointercancel", trackTouchEnd, true);
    scroller.addEventListener("scroll", () => {
      this.map.scrollLeft = scroller.scrollLeft;
      this.map.scrollTop = scroller.scrollTop;
    }, { passive: true });
    scroller.addEventListener("wheel", (event) => {
      event.preventDefault();
      const oldZoom = this.map.zoom || 1;
      const nextZoom = Math.max(0.2, Math.min(2, oldZoom * (event.deltaY < 0 ? 1.1 : 0.9)));
      const rect = scroller.getBoundingClientRect();
      this.setZoomAt(nextZoom, event.clientX - rect.left, event.clientY - rect.top);
    }, { passive: false });

    const touches = new Map();
    let touchPan = null;
    let pinch = null;
    let touchMoved = false;
    const touchDistance = (points) => Math.hypot(points[1].x - points[0].x, points[1].y - points[0].y);
    const beginPinch = () => {
      const points = [...touches.values()].slice(0, 2);
      if (points.length < 2) return;
      const rect = scroller.getBoundingClientRect();
      pinch = {
        distance: Math.max(1, touchDistance(points)),
        zoom: this.map.zoom || 1,
        focusX: (points[0].x + points[1].x) / 2 - rect.left,
        focusY: (points[0].y + points[1].y) / 2 - rect.top,
      };
      touchMoved = true;
      scroller.addClass("is-panning");
    };

    scroller.addEventListener("pointerdown", (event) => {
      if (event.pointerType !== "touch") return;
      if (!touches.size && event.target.closest(".kdh-node, .kdh-edge-label, .kdh-toolbar")) return;
      event.preventDefault();
      scroller.setPointerCapture(event.pointerId);
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size === 1) {
        touchMoved = false;
        touchPan = { x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop };
        scroller.addClass("is-panning");
      } else if (touches.size === 2) beginPinch();
    });

    scroller.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "touch" || !touches.has(event.pointerId)) return;
      event.preventDefault();
      touches.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (touches.size >= 2 && pinch) {
        const points = [...touches.values()].slice(0, 2);
        const rect = scroller.getBoundingClientRect();
        const focusX = (points[0].x + points[1].x) / 2 - rect.left;
        const focusY = (points[0].y + points[1].y) / 2 - rect.top;
        this.setZoomAt(pinch.zoom * (touchDistance(points) / pinch.distance), focusX, focusY);
      } else if (touchPan) {
        const dx = event.clientX - touchPan.x;
        const dy = event.clientY - touchPan.y;
        if (Math.hypot(dx, dy) > 4) touchMoved = true;
        scroller.scrollLeft = touchPan.left - dx;
        scroller.scrollTop = touchPan.top - dy;
      }
    });

    const endTouch = async (event) => {
      if (event.pointerType !== "touch" || !touches.has(event.pointerId)) return;
      touches.delete(event.pointerId);
      pinch = null;
      if (touches.size === 1) {
        const remaining = [...touches.values()][0];
        touchPan = { x: remaining.x, y: remaining.y, left: scroller.scrollLeft, top: scroller.scrollTop };
      } else {
        touchPan = null;
        scroller.removeClass("is-panning");
        this.map.scrollLeft = scroller.scrollLeft;
        this.map.scrollTop = scroller.scrollTop;
        if (!touchMoved) {
          this.map.selectedId = null;
          canvas.querySelectorAll(".kdh-node.is-selected").forEach((element) => element.removeClass("is-selected"));
          this.renderSummaryContent();
        }
        await this.saveMap();
      }
    };
    scroller.addEventListener("pointerup", endTouch);
    scroller.addEventListener("pointercancel", endTouch);

    scroller.addEventListener("pointerdown", (event) => {
      if (event.pointerType === "touch") return;
      const leftOnBackground = event.button === 0 && !event.target.closest(".kdh-node, .kdh-edge-label");
      if (!leftOnBackground && event.button !== 1) return;
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const startLeft = scroller.scrollLeft;
      const startTop = scroller.scrollTop;
      scroller.addClass("is-panning");
      scroller.setPointerCapture(event.pointerId);
      const move = (moveEvent) => {
        scroller.scrollLeft = startLeft - (moveEvent.clientX - startX);
        scroller.scrollTop = startTop - (moveEvent.clientY - startY);
      };
      const stop = async (stopEvent) => {
        scroller.removeClass("is-panning");
        scroller.removeEventListener("pointermove", move);
        scroller.removeEventListener("pointerup", stop);
        scroller.removeEventListener("pointercancel", stop);
        this.map.scrollLeft = scroller.scrollLeft;
        this.map.scrollTop = scroller.scrollTop;
        const moved = Math.hypot(stopEvent.clientX - startX, stopEvent.clientY - startY);
        if (event.button === 0 && moved < 4) {
          this.map.selectedId = null;
          canvas.querySelectorAll(".kdh-node.is-selected").forEach((element) => element.removeClass("is-selected"));
          this.renderSummaryContent();
        }
        await this.saveMap();
      };
      scroller.addEventListener("pointermove", move);
      scroller.addEventListener("pointerup", stop);
      scroller.addEventListener("pointercancel", stop);
    });
  }
}

module.exports = class KempfsSimpleDecisionHelper extends Plugin {
  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
    this.registerView(VIEW_TYPE, (leaf) => new DecisionMapView(leaf, this));
    this.registerExtensions([FILE_EXTENSION], VIEW_TYPE);
    this.addSettingTab(new DecisionHelperSettingTab(this.app, this));
    this.addRibbonIcon("git-branch", "New decision", () => this.createNewDecision());
    this.addCommand({ id: "new-decision", name: "Create new decision", callback: () => this.createNewDecision() });
  }

  async onunload() { this.app.workspace.detachLeavesOfType(VIEW_TYPE); }

  async saveSettings() { await this.saveData(this.settings); }

  async createFolderPath(rawPath) {
    const path = normalizePath(rawPath.trim().replace(/^\/+|\/+$/g, ""));
    if (!path || path === ".") {
      new Notice("Enter a folder inside the vault.");
      return null;
    }
    const existing = this.app.vault.getAbstractFileByPath(path);
    if (existing) {
      if (existing instanceof TFolder) return existing.path;
      new Notice("A file already uses that path.");
      return null;
    }
    let current = "";
    try {
      for (const part of path.split("/")) {
        current = normalizePath(current ? `${current}/${part}` : part);
        const item = this.app.vault.getAbstractFileByPath(current);
        if (item && !(item instanceof TFolder)) throw new Error("A file blocks part of that folder path.");
        if (!item) await this.app.vault.createFolder(current);
      }
      new Notice(`Decision folder set to ${path}`);
      return path;
    } catch (error) {
      new Notice(error?.message || "The folder could not be created.");
      return null;
    }
  }

  availablePath(title) {
    const safeName = title
      .replace(/[\\/:*?"<>|#\[\]^]/g, "")
      .replace(/[. ]+$/g, "")
      .trim()
      .slice(0, 80) || "New decision";
    let folder = this.settings.defaultFolder || "";
    if (folder && !(this.app.vault.getAbstractFileByPath(folder) instanceof TFolder)) {
      folder = "";
      new Notice("The default decision folder no longer exists. Saving in the vault root.");
    }
    let index = 1;
    let path;
    do {
      const suffix = index === 1 ? "" : ` ${index}`;
      path = normalizePath(`${folder ? `${folder}/` : ""}${safeName}${suffix}.${FILE_EXTENSION}`);
      index += 1;
    } while (this.app.vault.getAbstractFileByPath(path));
    return path;
  }

  createNewDecision() {
    new NodeEditorModal(this.app, {
      heading: "Enter the decision",
      type: "decision",
      isRoot: true,
      onSave: async ({ text }) => {
        const root = {
          id: `node-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          text,
          type: "decision",
          parentId: null,
          relationship: "",
          likelihood: 0,
          impact: 0,
          isConstraint: false,
          subOptionMode: this.settings.defaultSubOptionMode,
          childIds: [],
        };
        const map = { ...newMapWithDefaults(this.settings), rootId: root.id, selectedId: root.id, nodes: [root] };
        const file = await this.app.vault.create(this.availablePath(text), JSON.stringify(map, null, 2));
        const leaf = this.app.workspace.getLeaf("tab");
        await leaf.openFile(file);
        this.app.workspace.revealLeaf(leaf);
      },
    }).open();
  }
};
