const {
  TextFileView,
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
const LEGACY_CANVAS_SPACES = new Set([1200, 6000]);
const CANVAS_SPACE = 12000;
const MIN_ZOOM = 0.05;

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

const DECISION_TEMPLATES = {
  blank: {
    name: "Blank",
    description: "Start with only the Decision node.",
    options: [],
  },
  simple: {
    name: "Simple Choice",
    description: "Compare two choices using one starting Benefit and Risk for each.",
    options: [
      { text: "Option A", factors: [{ type: "benefit", text: "Primary advantage" }, { type: "risk", text: "Primary concern" }] },
      { text: "Option B", factors: [{ type: "benefit", text: "Primary advantage" }, { type: "risk", text: "Primary concern" }] },
    ],
  },
  buy_or_keep: {
    name: "Buy or Keep",
    description: "Compare buying something new with continuing to use what you already have.",
    options: [
      { text: "Buy new", factors: [{ type: "benefit", text: "Improved features or performance" }, { type: "benefit", text: "Warranty and expected reliability" }, { type: "risk", text: "Upfront purchase cost" }] },
      { text: "Keep current", factors: [{ type: "benefit", text: "Avoid immediate expense" }, { type: "benefit", text: "Already familiar" }, { type: "risk", text: "Repair or failure risk" }] },
    ],
  },
  education: {
    name: "Education/Training",
    description: "Compare formal study, a shorter credential, and self-directed learning.",
    options: [
      { text: "Formal program", factors: [{ type: "benefit", text: "Recognized qualification" }, { type: "risk", text: "Higher cost and time commitment" }] },
      { text: "Course or certification", factors: [{ type: "benefit", text: "Focused, practical training" }, { type: "risk", text: "May cover a narrower skill set" }] },
      { text: "Self-directed learning", factors: [{ type: "benefit", text: "Flexible and inexpensive" }, { type: "risk", text: "Requires discipline and may lack recognition" }] },
    ],
  },
  home_improvement: {
    name: "Home Improvement",
    description: "Compare repairing, replacing or renovating, and postponing the work.",
    options: [
      { text: "Repair", factors: [{ type: "benefit", text: "Lower immediate cost" }, { type: "risk", text: "May not solve the underlying problem" }] },
      { text: "Replace or renovate", factors: [{ type: "benefit", text: "Longer useful life and improved result" }, { type: "risk", text: "Higher cost and disruption" }] },
      { text: "Postpone", factors: [{ type: "benefit", text: "Preserve cash now" }, { type: "risk", text: "Damage or costs may grow" }] },
    ],
  },
  event_planning: {
    name: "Event Planning",
    description: "Compare practical ways to host an event by cost, effort, and guest experience.",
    options: [
      { text: "Host it yourself", factors: [{ type: "benefit", text: "More control and personal touches" }, { type: "risk", text: "More setup and cleanup work" }] },
      { text: "Book a venue", factors: [{ type: "benefit", text: "Professional space and support" }, { type: "risk", text: "Higher cost and less flexibility" }] },
      { text: "Keep it small and simple", factors: [{ type: "benefit", text: "Easier to organize and afford" }, { type: "risk", text: "Fewer guests or activities" }] },
    ],
  },
  travel_planning: {
    name: "Travel Planning",
    description: "Compare common travel choices by convenience, cost, flexibility, and time.",
    options: [
      { text: "Drive", factors: [{ type: "benefit", text: "Flexible schedule and stops" }, { type: "risk", text: "Long drive and fuel costs" }] },
      { text: "Fly", factors: [{ type: "benefit", text: "Usually faster for long distances" }, { type: "risk", text: "Tickets, delays, and airport time" }] },
      { text: "Train or bus", factors: [{ type: "benefit", text: "Travel without driving" }, { type: "risk", text: "Limited routes and schedules" }] },
    ],
  },
  pros_and_cons: {
    name: "Pros and Cons",
    description: "Start a straightforward comparison with two choices and editable pros and cons.",
    options: [
      { text: "Choice A", factors: [{ type: "benefit", text: "Most important pro" }, { type: "risk", text: "Most important con" }] },
      { text: "Choice B", factors: [{ type: "benefit", text: "Most important pro" }, { type: "risk", text: "Most important con" }] },
    ],
  },
};

function normalizeBackground(value) {
  if (value === "light") return "paper";
  return value === "dark" || value === "paper" ? value : "system";
}

function normalizeLayout(value) {
  if (value === "linear") return "linear-down-right";
  return [
    "down", "up", "right", "left",
    "staggered-up", "staggered-down", "staggered-left", "staggered-right",
    "linear-up-left", "linear-up-right", "linear-down-left", "linear-down-right",
    "linear-left-up", "linear-left-down", "linear-right-up", "linear-right-down",
  ].includes(value) ? value : "down";
}

function layoutLabel(value) {
  return {
    right: "Right-facing",
    left: "Left-facing",
    up: "Top-facing",
    down: "Bottom-facing",
    "staggered-up": "Staggered — Up",
    "staggered-down": "Staggered — Down",
    "staggered-left": "Staggered — Left",
    "staggered-right": "Staggered — Right",
    "linear-up-left": "Up and Left",
    "linear-up-right": "Up and Right",
    "linear-down-left": "Down and Left",
    "linear-down-right": "Down and Right",
    "linear-left-up": "Left and Up",
    "linear-left-down": "Left and Down",
    "linear-right-up": "Right and Up",
    "linear-right-down": "Right and Down",
  }[normalizeLayout(value)] || "Bottom-facing";
}

function layoutFamily(value) {
  const normalized = normalizeLayout(value);
  if (normalized.startsWith("linear-")) return "linear";
  if (normalized.startsWith("staggered-")) return "staggered";
  return "standard";
}

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
    canvasSpace: CANVAS_SPACE,
    nodeInfoCollapsed: false,
    summaryCollapsed: false,
    showWarnings: true,
    showScoreLabels: true,
    dimUnselectedBranches: true,
    dimStrength: 50,
    siblingSpacing: "regular",
    levelSpacing: "regular",
  };
}

function newMapWithDefaults(settings) {
  return {
    ...emptyMap(),
    zoom: 1,
    layout: normalizeLayout(settings.defaultLayout),
    background: normalizeBackground(settings.defaultBackground),
  };
}

function createDecisionMapFromTemplate(settings, title, templateId = "blank") {
  const template = DECISION_TEMPLATES[templateId] || DECISION_TEMPLATES.blank;
  let sequence = 0;
  const makeId = () => `node-${Date.now()}-${++sequence}-${Math.random().toString(36).slice(2, 7)}`;
  const root = {
    id: makeId(), text: title, type: "decision", parentId: null, relationship: "", likelihood: 0, impact: 0,
    isConstraint: false, subOptionMode: "alternative", notes: "", collapsed: false, locked: false, childIds: [],
  };
  const nodes = [root];
  for (const optionTemplate of template.options) {
    const option = {
      id: makeId(), text: optionTemplate.text, type: "option", parentId: root.id, relationship: DEFAULT_RELATIONSHIPS.option,
      likelihood: 0, impact: 0, isConstraint: false, subOptionMode: "alternative", notes: "", collapsed: false, locked: false, childIds: [],
    };
    root.childIds.push(option.id);
    nodes.push(option);
    for (const factorTemplate of optionTemplate.factors || []) {
      const factor = {
        id: makeId(), text: factorTemplate.text, type: factorTemplate.type, parentId: option.id,
        relationship: DEFAULT_RELATIONSHIPS[factorTemplate.type], likelihood: 1, impact: 1, isConstraint: false,
        subOptionMode: "alternative", notes: "", collapsed: false, locked: false, childIds: [],
      };
      option.childIds.push(factor.id);
      nodes.push(factor);
    }
  }
  return { ...newMapWithDefaults(settings), rootId: root.id, selectedId: root.id, nodes };
}

class DecisionTemplatePreviewModal extends Modal {
  constructor(app, map, templateName) {
    super(app);
    this.map = map;
    this.templateName = templateName;
  }

  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass("kdh-template-preview-window");
    contentEl.createEl("h2", { text: `${this.templateName} preview` });
    const canvas = contentEl.createDiv({ cls: "kdh-template-preview", attr: { role: "img", "aria-label": `${this.templateName} decision template preview` } });
    const root = this.map.nodes.find((node) => node.id === this.map.rootId);
    const rootCard = canvas.createDiv({ cls: "kdh-template-preview-root" });
    rootCard.createDiv({ cls: "kdh-template-preview-type", text: "Decision" });
    rootCard.createDiv({ cls: "kdh-template-preview-text", text: root?.text || "Decision" });
    const options = (root?.childIds || []).map((id) => this.map.nodes.find((node) => node.id === id)).filter(Boolean);
    if (!options.length) {
      canvas.createDiv({ cls: "kdh-template-preview-empty", text: "Add options to begin comparing choices." });
    } else {
      const branches = canvas.createDiv({ cls: "kdh-template-preview-branches" });
      for (const option of options) {
        const branch = branches.createDiv({ cls: "kdh-template-preview-branch" });
        const optionCard = branch.createDiv({ cls: "kdh-template-preview-option" });
        optionCard.createDiv({ cls: "kdh-template-preview-type", text: "Option" });
        optionCard.createDiv({ cls: "kdh-template-preview-text", text: option.text });
        const factors = branch.createDiv({ cls: "kdh-template-preview-factors" });
        for (const childId of option.childIds) {
          const factor = this.map.nodes.find((node) => node.id === childId);
          if (!factor) continue;
          const factorCard = factors.createDiv({ cls: `kdh-template-preview-factor is-${factor.type}` });
          factorCard.createDiv({ cls: "kdh-template-preview-type", text: factor.type === "benefit" ? "Benefit" : "Risk" });
          factorCard.createDiv({ cls: "kdh-template-preview-text", text: factor.text });
        }
      }
    }
    new Setting(contentEl).addButton((button) => button.setButtonText("Close").setCta().onClick(() => this.close()));
  }

  onClose() { this.contentEl.empty(); }
}

class DecisionLayoutPickerModal extends Modal {
  constructor(app, currentLayout, background, onApply) {
    super(app);
    this.selectedLayout = normalizeLayout(currentLayout);
    this.background = normalizeBackground(background);
    this.onApplyLayout = onApply;
  }

  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass("kdh-layout-picker-window");
    contentEl.addClass("kdh-layout-picker-modal");
    contentEl.createEl("h2", { text: "Choose layout" });
    const body = contentEl.createDiv({ cls: "kdh-layout-picker-body" });
    const controls = body.createDiv({ cls: "kdh-layout-picker-controls" });
    const previewPane = body.createDiv({ cls: "kdh-layout-preview-pane" });
    previewPane.createEl("h3", { text: "Preview" });
    this.previewEl = previewPane.createDiv({ cls: "kdh-layout-preview", attr: { role: "img" } });
    this.selectionEl = controls.createDiv({ cls: "kdh-layout-picker-selection" });
    this.renderControls();
    this.renderPreview();
    new Setting(contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) => button.setButtonText("Apply").setCta().onClick(() => {
        this.close();
        this.onApplyLayout(this.selectedLayout);
      }));
  }

  chooseLayout(layout) {
    this.selectedLayout = normalizeLayout(layout);
    this.renderControls();
    this.renderPreview();
  }

  addChoiceGroup(parent, title, choices) {
    parent.createEl("h3", { text: title });
    const group = parent.createDiv({ cls: "kdh-layout-choice-grid" });
    for (const [value, label] of choices) {
      const button = group.createEl("button", { text: label, cls: value === this.selectedLayout ? "is-selected" : "" });
      button.setAttr("type", "button");
      button.setAttr("aria-pressed", value === this.selectedLayout ? "true" : "false");
      button.addEventListener("click", () => this.chooseLayout(value));
    }
  }

  renderControls() {
    const parent = this.selectionEl;
    parent.empty();
    const family = layoutFamily(this.selectedLayout);
    parent.createEl("h3", { text: "Layout style" });
    const families = parent.createDiv({ cls: "kdh-layout-family-grid" });
    [["standard", "Standard"], ["staggered", "Staggered"], ["linear", "Linear"]].forEach(([value, label]) => {
      const button = families.createEl("button", { text: label, cls: value === family ? "is-selected" : "" });
      button.setAttr("type", "button");
      button.setAttr("aria-pressed", value === family ? "true" : "false");
      button.addEventListener("click", () => {
        if (value !== family) {
          const defaults = { standard: "right", staggered: "staggered-right", linear: "linear-down-right" };
          this.chooseLayout(defaults[value]);
        }
      });
    });
    if (family === "standard") {
      this.addChoiceGroup(parent, "Direction", [
        ["up", "↑ Top-facing"], ["down", "↓ Bottom-facing"],
        ["left", "← Left-facing"], ["right", "→ Right-facing"],
      ]);
    } else if (family === "staggered") {
      this.addChoiceGroup(parent, "Trunk direction", [
        ["staggered-up", "↑ Up"], ["staggered-down", "↓ Down"],
        ["staggered-left", "← Left"], ["staggered-right", "→ Right"],
      ]);
    } else {
      const [, sequence, branch] = this.selectedLayout.split("-");
      this.addChoiceGroup(parent, "Sequence direction", [
        [`linear-up-${["left", "right"].includes(branch) ? branch : "right"}`, "↑ Up"],
        [`linear-down-${["left", "right"].includes(branch) ? branch : "right"}`, "↓ Down"],
        [`linear-left-${["up", "down"].includes(branch) ? branch : "down"}`, "← Left"],
        [`linear-right-${["up", "down"].includes(branch) ? branch : "down"}`, "→ Right"],
      ]);
      const branchChoices = ["up", "down"].includes(sequence)
        ? [[`linear-${sequence}-left`, "← Left"], [`linear-${sequence}-right`, "→ Right"]]
        : [[`linear-${sequence}-up`, "↑ Up"], [`linear-${sequence}-down`, "↓ Down"]];
      this.addChoiceGroup(parent, "Branch direction", branchChoices);
    }
    parent.createEl("p", { text: `Selected: ${layoutLabel(this.selectedLayout)}`, cls: "kdh-layout-current" });
  }

  svgElement(name, attributes = {}) {
    const element = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
    return element;
  }

  previewNodes() {
    const layout = this.selectedLayout;
    let nodes;
    if (layout.startsWith("linear-")) {
      const [, sequence] = layout.split("-");
      nodes = ["up", "down"].includes(sequence)
        ? [
          { id: "decision", type: "decision", text: "Choose a plan", x: 70, y: 28, w: 170, h: 58 },
          { id: "option-a", parent: "decision", type: "option", text: "Option A", x: 225, y: 125, w: 130, h: 50 },
          { id: "benefit-a", parent: "option-a", type: "benefit", text: "Strong benefit", x: 365, y: 205, w: 135, h: 48 },
          { id: "risk-a", parent: "option-a", type: "risk", text: "Possible risk", x: 365, y: 278, w: 135, h: 48 },
          { id: "option-b", parent: "decision", type: "option", text: "Option B", x: 225, y: 365, w: 130, h: 50 },
          { id: "benefit-b", parent: "option-b", type: "benefit", text: "Useful benefit", x: 365, y: 438, w: 135, h: 48 },
        ]
        : [
          { id: "decision", type: "decision", text: "Choose a plan", x: 20, y: 45, w: 150, h: 58 },
          { id: "option-a", parent: "decision", type: "option", text: "Option A", x: 190, y: 185, w: 115, h: 50 },
          { id: "benefit-a", parent: "option-a", type: "benefit", text: "Benefit", x: 325, y: 325, w: 110, h: 48 },
          { id: "risk-a", parent: "option-a", type: "risk", text: "Risk", x: 455, y: 325, w: 100, h: 48 },
          { id: "option-b", parent: "decision", type: "option", text: "Option B", x: 570, y: 185, w: 115, h: 50 },
        ];
      const branch = layout.split("-")[2];
      if (sequence === "left") for (const node of nodes) node.x = 700 - node.x - node.w;
      if (sequence === "up" || branch === "up") for (const node of nodes) node.y = 520 - node.y - node.h;
      if (["up", "down"].includes(sequence) && branch === "left") for (const node of nodes) node.x = 700 - node.x - node.w;
      return nodes;
    }
    if (layout.startsWith("staggered-")) {
      const direction = layout.slice("staggered-".length);
      nodes = ["left", "right"].includes(direction)
        ? [
          { id: "decision", type: "decision", text: "Choose a plan", x: 25, y: 231, w: 170, h: 58 },
          { id: "option-a", parent: "decision", type: "option", text: "Option A", x: 245, y: 165, w: 130, h: 50, branchDirection: "up" },
          { id: "benefit-a", parent: "option-a", type: "benefit", text: "Benefit", x: 245, y: 55, w: 130, h: 48, branchDirection: "up" },
          { id: "option-b", parent: "decision", type: "option", text: "Option B", x: 470, y: 310, w: 130, h: 50, branchDirection: "down" },
          { id: "risk-b", parent: "option-b", type: "risk", text: "Risk", x: 470, y: 420, w: 130, h: 48, branchDirection: "down" },
        ]
        : [
          { id: "decision", type: "decision", text: "Choose a plan", x: 265, y: 25, w: 170, h: 58 },
          { id: "option-a", parent: "decision", type: "option", text: "Option A", x: 190, y: 190, w: 130, h: 50, branchDirection: "left" },
          { id: "benefit-a", parent: "option-a", type: "benefit", text: "Benefit", x: 35, y: 190, w: 130, h: 48, branchDirection: "left" },
          { id: "option-b", parent: "decision", type: "option", text: "Option B", x: 390, y: 365, w: 130, h: 50, branchDirection: "right" },
          { id: "risk-b", parent: "option-b", type: "risk", text: "Risk", x: 545, y: 365, w: 130, h: 48, branchDirection: "right" },
        ];
      if (direction === "left") for (const node of nodes) node.x = 700 - node.x - node.w;
      if (direction === "up") for (const node of nodes) node.y = 520 - node.y - node.h;
      return nodes;
    }
    nodes = layout === "right" || layout === "left"
        ? [
          { id: "decision", type: "decision", text: "Choose a plan", x: 32, y: 225, w: 170, h: 58 },
          { id: "option-a", parent: "decision", type: "option", text: "Option A", x: 270, y: 115, w: 130, h: 50 },
          { id: "option-b", parent: "decision", type: "option", text: "Option B", x: 270, y: 345, w: 130, h: 50 },
          { id: "benefit-a", parent: "option-a", type: "benefit", text: "Strong benefit", x: 505, y: 58, w: 135, h: 48 },
          { id: "risk-a", parent: "option-a", type: "risk", text: "Possible risk", x: 505, y: 185, w: 135, h: 48 },
          { id: "benefit-b", parent: "option-b", type: "benefit", text: "Useful benefit", x: 505, y: 292, w: 135, h: 48 },
          { id: "risk-b", parent: "option-b", type: "risk", text: "Another risk", x: 505, y: 420, w: 135, h: 48 },
        ]
        : [
          { id: "decision", type: "decision", text: "Choose a plan", x: 265, y: 30, w: 170, h: 58 },
          { id: "option-a", parent: "decision", type: "option", text: "Option A", x: 125, y: 205, w: 130, h: 50 },
          { id: "option-b", parent: "decision", type: "option", text: "Option B", x: 445, y: 205, w: 130, h: 50 },
          { id: "benefit-a", parent: "option-a", type: "benefit", text: "Strong benefit", x: 40, y: 405, w: 135, h: 48 },
          { id: "risk-a", parent: "option-a", type: "risk", text: "Possible risk", x: 205, y: 405, w: 135, h: 48 },
          { id: "benefit-b", parent: "option-b", type: "benefit", text: "Useful benefit", x: 370, y: 405, w: 135, h: 48 },
          { id: "risk-b", parent: "option-b", type: "risk", text: "Another risk", x: 535, y: 405, w: 135, h: 48 },
        ];
    if (layout === "left") {
      for (const node of nodes) node.x = 700 - node.x - node.w;
    }
    if (layout === "up") {
      for (const node of nodes) node.y = 520 - node.y - node.h;
    }
    return nodes;
  }

  renderPreview() {
    const preview = this.previewEl;
    preview.empty();
    preview.classList.remove("is-dark", "is-paper", "is-system");
    preview.addClass(`is-${this.background}`);
    const svg = this.svgElement("svg", { viewBox: "0 0 700 520", "aria-label": `${layoutLabel(this.selectedLayout)} layout preview` });
    const nodes = this.previewNodes();
    const byId = new Map(nodes.map((node) => [node.id, node]));
    const linear = this.selectedLayout.startsWith("linear-");
    const staggered = this.selectedLayout.startsWith("staggered-");
    const [, sequenceDirection, branchDirection] = linear ? this.selectedLayout.split("-") : [];
    const verticalSequence = linear && ["up", "down"].includes(sequenceDirection);
    const left = this.selectedLayout === "left";
    const up = this.selectedLayout === "up";
    const anchor = (item, direction, outgoing) => {
      if (direction === "right") return { x: outgoing ? item.x + item.w : item.x, y: item.y + item.h / 2 };
      if (direction === "left") return { x: outgoing ? item.x : item.x + item.w, y: item.y + item.h / 2 };
      if (direction === "down") return { x: item.x + item.w / 2, y: outgoing ? item.y + item.h : item.y };
      return { x: item.x + item.w / 2, y: outgoing ? item.y : item.y + item.h };
    };
    for (const node of nodes) {
      const parent = node.parent ? byId.get(node.parent) : null;
      if (!parent) continue;
      let d;
      if (linear) {
        if (verticalSequence) {
          const goesLeft = branchDirection === "left";
          const startX = goesLeft ? parent.x + parent.w - 16 : parent.x + 16;
          const startY = sequenceDirection === "up" ? parent.y : parent.y + parent.h;
          const endX = goesLeft ? node.x + node.w : node.x;
          const endY = node.y + node.h / 2;
          d = `M ${startX} ${startY} L ${startX} ${endY} L ${endX} ${endY}`;
        } else {
          const branchUp = branchDirection === "up";
          const startX = sequenceDirection === "left" ? parent.x : parent.x + parent.w;
          const startY = branchUp ? parent.y + parent.h - 16 : parent.y + 16;
          const endX = node.x + node.w / 2;
          const endY = branchUp ? node.y + node.h : node.y;
          d = `M ${startX} ${startY} L ${endX} ${startY} L ${endX} ${endY}`;
        }
      } else if (staggered) {
        const trunkDirection = this.selectedLayout.slice("staggered-".length);
        const direction = node.branchDirection;
        const start = anchor(parent, parent.type === "decision" ? trunkDirection : direction, true);
        const end = anchor(node, direction, false);
        if (parent.type === "decision") {
          d = ["left", "right"].includes(trunkDirection)
            ? `M ${start.x} ${start.y} L ${end.x} ${start.y} L ${end.x} ${end.y}`
            : `M ${start.x} ${start.y} L ${start.x} ${end.y} L ${end.x} ${end.y}`;
        } else {
          const middleX = (start.x + end.x) / 2;
          const middleY = (start.y + end.y) / 2;
          d = ["left", "right"].includes(direction)
            ? `M ${start.x} ${start.y} C ${middleX} ${start.y}, ${middleX} ${end.y}, ${end.x} ${end.y}`
            : `M ${start.x} ${start.y} C ${start.x} ${middleY}, ${end.x} ${middleY}, ${end.x} ${end.y}`;
        }
      } else if (this.selectedLayout === "right" || this.selectedLayout === "left") {
        const startX = left ? parent.x : parent.x + parent.w;
        const endX = left ? node.x + node.w : node.x;
        const startY = parent.y + parent.h / 2;
        const endY = node.y + node.h / 2;
        const middleX = (startX + endX) / 2;
        d = `M ${startX} ${startY} C ${middleX} ${startY}, ${middleX} ${endY}, ${endX} ${endY}`;
      } else {
        const startX = parent.x + parent.w / 2;
        const endX = node.x + node.w / 2;
        const startY = up ? parent.y : parent.y + parent.h;
        const endY = up ? node.y + node.h : node.y;
        const middleY = (startY + endY) / 2;
        d = `M ${startX} ${startY} C ${startX} ${middleY}, ${endX} ${middleY}, ${endX} ${endY}`;
      }
      svg.appendChild(this.svgElement("path", { d, class: `kdh-layout-preview-line is-${node.type}` }));
    }
    for (const node of nodes) {
      svg.appendChild(this.svgElement("rect", { x: node.x, y: node.y, width: node.w, height: node.h, rx: 9, class: `kdh-layout-preview-node is-${node.type}` }));
      const type = this.svgElement("text", { x: node.x + node.w / 2, y: node.y + 18, class: "kdh-layout-preview-type" });
      type.textContent = node.type.toUpperCase();
      const label = this.svgElement("text", { x: node.x + node.w / 2, y: node.y + 37, class: "kdh-layout-preview-label" });
      label.textContent = node.text;
      svg.append(type, label);
    }
    preview.appendChild(svg);
  }

  onClose() { this.contentEl.empty(); }
}

class CreateDecisionModal extends Modal {
  constructor(app, settings, onSubmit) {
    super(app);
    this.settings = settings;
    this.onSubmit = onSubmit;
  }

  onOpen() {
    const { contentEl } = this;
    this.modalEl.addClass("kdh-create-decision-window");
    contentEl.createEl("h2", { text: "Create decision" });
    let title = "What needs to be decided?";
    let templateId = "blank";

    const titleSetting = new Setting(contentEl).setName("Decision");
    titleSetting.addText((text) => {
      text.setValue(title).onChange((value) => { title = value; });
      window.setTimeout(() => { text.inputEl.focus(); text.inputEl.select(); }, 0);
    });

    const templateSetting = new Setting(contentEl).setName("Starting template").setDesc(DECISION_TEMPLATES.blank.description);
    templateSetting.addDropdown((dropdown) => {
      for (const [id, template] of Object.entries(DECISION_TEMPLATES)) dropdown.addOption(id, template.name);
      dropdown.setValue(templateId).onChange((value) => {
        templateId = DECISION_TEMPLATES[value] ? value : "blank";
        templateSetting.setDesc(DECISION_TEMPLATES[templateId].description);
      });
    });
    templateSetting.addButton((button) => button.setButtonText("Preview").onClick(() => {
      const cleanTitle = title.trim() || "What needs to be decided?";
      const map = createDecisionMapFromTemplate(this.settings, cleanTitle, templateId);
      new DecisionTemplatePreviewModal(this.app, map, DECISION_TEMPLATES[templateId].name).open();
    }));

    const submit = () => {
      const cleanTitle = title.trim();
      if (!cleanTitle) {
        new Notice("Enter the decision.");
        return;
      }
      this.close();
      this.onSubmit(cleanTitle, templateId);
    };
    titleSetting.controlEl.querySelector("input")?.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" || event.isComposing) return;
      event.preventDefault();
      submit();
    });
    new Setting(contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) => button.setButtonText("Create").setCta().onClick(submit));
  }

  onClose() { this.contentEl.empty(); }
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
    this.notes = String(options.notes || "");
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
    let evidenceBox;
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

    const renderEvidenceControls = () => {
      if (!evidenceBox) return;
      evidenceBox.empty();
      if (this.type !== "benefit" && this.type !== "risk") return;
      evidenceBox.createDiv({
        cls: "kdh-evidence-help",
        text: "Optional context for why you chose these ratings.",
      });
      new Setting(evidenceBox)
        .setName("Supporting notes")
        .setDesc("Optional details that support this rating")
        .addTextArea((field) => {
          field
            .setPlaceholder("What supports this rating?")
            .setValue(this.notes)
            .onChange((value) => { this.notes = value; });
          field.inputEl.rows = 5;
        });
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
      renderEvidenceControls();
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

    let textInput;
    new Setting(formEl)
      .setClass("kdh-text-setting")
      .setName("Node text")
      .addText((field) => {
        textInput = field.inputEl;
        field
          .setPlaceholder(this.isRoot ? "What needs to be decided?" : "Enter the option, benefit, or risk")
          .setValue(this.text)
          .onChange((value) => { this.text = value; });
      });

    scoreBox = formEl.createDiv({ cls: "kdh-score-controls" });
    evidenceBox = formEl.createDiv({ cls: "kdh-evidence-controls" });
    optionBox = formEl.createDiv({ cls: "kdh-option-controls" });
    renderScoreControls();
    renderEvidenceControls();
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
      const isFactor = this.type === "benefit" || this.type === "risk";
      this.onSave({
        text,
        type: this.isRoot ? "decision" : this.type,
        relationship: this.relationship.trim(),
        likelihood: this.type === "benefit" || this.type === "risk" ? this.likelihood : 0,
        impact: this.type === "benefit" || this.type === "risk" ? this.impact : 0,
        isConstraint: this.type === "risk" ? this.isConstraint : false,
        subOptionMode: this.type === "option" ? this.subOptionMode : "alternative",
        notes: isFactor ? this.notes.trim() : "",
      });
      this.close();
    };

    saveButton.addEventListener("click", save);
    textInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        save();
      }
    });
    setTimeout(() => textInput.focus(), 0);
  }

  onClose() {
    this.contentEl.empty();
  }
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

class CollapseToLevelModal extends Modal {
  constructor(app, maximumLevel, initialLevel, canApply, onApply) {
    super(app);
    this.maximumLevel = Math.max(1, maximumLevel);
    this.level = Math.min(this.maximumLevel, Math.max(1, initialLevel || 1));
    this.canApply = canApply;
    this.onApply = onApply;
  }

  onOpen() {
    this.contentEl.createEl("h2", { text: "Collapse map to level" });
    this.contentEl.createEl("p", { text: "Keep the chosen number of levels visible and collapse deeper branches." });
    let applyButton;
    const updateApply = () => { if (applyButton) applyButton.disabled = !this.canApply(this.level); };
    new Setting(this.contentEl).setName("Visible levels").addDropdown((dropdown) => {
      for (let level = 1; level <= this.maximumLevel; level += 1) dropdown.addOption(String(level), String(level));
      dropdown.setValue(String(this.level)).onChange((value) => { this.level = Number(value); updateApply(); });
    });
    const actions = this.contentEl.createDiv({ cls: "kdh-editor-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    applyButton = actions.createEl("button", { text: "Apply", cls: "mod-cta" });
    applyButton.addEventListener("click", () => {
      this.onApply(this.level);
      this.close();
    });
    updateApply();
  }

  onClose() { this.contentEl.empty(); }
}

class DecisionHelpModal extends Modal {
  onOpen() {
    this.modalEl.addClass("kdh-help-modal");
    const { contentEl } = this;
    contentEl.addClass("kdh-help-content");
    contentEl.createEl("h2", { text: "The Kempf Simple Decision Helper" });
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
    section("Supporting evidence", "Benefits and risks can include Supporting notes. A paperclip marks factors with notes. Supporting notes explain a rating but do not change its score.");
    section("How scores work", "The helper uses the same consistent calculation for every choice. You only supply the two simple 1–5 ratings.");
    formula("Factor score", "Likelihood × Impact", "Each benefit or risk scores from 1 to 25.");
    formula("Option score", "((Σ Benefit Scores − Σ Risk Scores) ÷ (Number of Factors × 25)) × 100", "This puts every option on the same −100 to +100 scale, even when options have different numbers of factors.");
    formula("Main decision score", "max(Eligible Top-Level Option Scores)", "The decision shows the strongest option that is not blocked by a deal-breaker.");
    section("Reading the scale", "+100 is entirely favorable, −100 is entirely unfavorable, and a score near 0 is balanced. The score helps comparison; it does not make the choice for you.");
    section("Sub-options: Single Path or All Paths", "Use Single Path when the child options are alternatives, such as drive, take the bus, or walk. Use All Paths when every child is part of one plan, such as review notes, practice questions, and get enough sleep.");
    section("Sub-option badges", "An option with child options is marked SINGLE PATH or ALL PATHS, so the tree shows whether it will select the strongest child path or combine every child path.");
    section("Starting templates", "When creating a decision, choose Blank, Simple Choice, Buy or Keep, Education/Training, Home Improvement, Event Planning, Travel Planning, or Pros and Cons. Preview shows the Decision, Options, Benefits, and Risks before the file is created. Template nodes are ordinary editable nodes; replace or remove anything that does not fit your decision.");
    section("Incomplete All Paths plans", "If a required All Paths sub-option has no rated benefits or risks, the summary names that path and warns that it was excluded from the numerical score. Evaluate every required path before treating the plan as complete.");
    section("Deal-breakers", "Turn this on only for a risk that makes an option unacceptable regardless of its numerical score—for example, an option that exceeds a firm budget limit.");
    section("Reading the Decision summary", "The comparison chart is ordered from strongest to weakest. Red extends left for risks and green extends right for benefits. Click an option in the chart to select and reveal the same node in the tree. Not evaluated means an option has no benefits or risks yet and is excluded from the recommendation. The summary remembers whether it was expanded or collapsed when you reopen the decision. Pin selected node information while inspecting other nodes, or collapse it to save space.");
    section("Mouse and touch", "", [
      "Drag empty background with the left or middle mouse button to pan.",
      "Use the mouse wheel or a two-finger pinch to zoom.",
      "Use Fit decision to center and scale every currently visible node.",
      "Use Search nodes or Ctrl/Cmd+F to find node titles; Enter and Shift+Enter move between matches.",
      "Use the minus or numbered badge in a parent node's upper-right corner to collapse or expand its descendants. The node stays under the pointer.",
      "Drag a node onto a valid Decision or Option node to move its entire branch.",
      "Double-click a node to edit it.",
      "Right-click a node to move, copy, paste, edit, or delete its branch.",
      "Right-click the background for layout, background color, JSON backup import, and export options.",
      "On a touchscreen, press and hold a node or the background to open the same menus.",
    ]);
    section("Keyboard", "", [
      "Arrow keys move through the visible tree.",
      "Enter or Tab adds a connected item beneath the selected Decision or Option.",
      "F2 edits the selected node.",
      "With an Option selected, B adds a Benefit and D adds a Risk.",
      "Space collapses or expands the selected parent node.",
      "Delete removes the selected branch after confirmation.",
      "Inside the node editor, Enter saves the single-line node title. Longer context belongs in Supporting notes.",
      "Ctrl/Cmd+Z undoes; Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y redoes.",
    ]);
    section("Files and toolbar", "Each decision is its own .ksdh vault file. Global settings control the defaults for new decisions and provide separate controls for choosing an existing save folder or creating a nested folder. The toolbar includes Fit decision and Search nodes alongside current-decision options for warnings, node score labels, dimming, and spacing. The file-plus button starts another decision; the curved arrows undo and redo; minus and plus change zoom; the question mark opens this guide.");
    section("Layouts", "Change layout opens a visual picker modeled on Mind Map. Its 16 arrangements include four Standard directions, four Staggered trunk directions, and eight Linear sequence-and-branch combinations. Inspect the preview, then Apply the layout or Cancel without changing the decision. Layout changes never alter nodes, ratings, or scores. Blue, green, and red branch lines identify Options, Benefits, and Risks.");
    section("Collapsed, focused, and locked branches", "Collapsing a branch hides its descendants. The node and background menus can collapse the entire map, expand it, or collapse it to a chosen visible level. Focus branch keeps the chosen node, its descendants, and its path back to the Decision visible. Lock branch protects that node and everything beneath it from editing, moving, pasting, or deletion until unlocked. These view actions do not change scores or remove nodes.");
    section("Import and export", "JSON is the complete backup format and the only format that can restore a decision. Markdown creates a readable report without hidden backup data. SVG, JPG, and PDF document export the visible map. Presentation PDF creates a polished one-page Letter-size brief with the decision, recommendation, comparison, warning, strongest benefits, greatest risks, and leading option snapshots; it opens a preview before the save dialog.");
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
      dimUnselectedBranches: view.map.dimUnselectedBranches !== false,
      dimStrength: Math.min(90, Math.max(0, Number(view.map.dimStrength) || 0)),
      siblingSpacing: view.map.siblingSpacing || "regular",
      levelSpacing: view.map.levelSpacing || "regular",
    };
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.createEl("h2", { text: "Decision options" });
    contentEl.createEl("p", { text: "These settings apply only to this decision file." });
    const layoutSetting = new Setting(contentEl)
      .setName("Layout")
      .setDesc(`Current: ${layoutLabel(this.view.map.layout)}`)
      .addButton((button) => button.setButtonText("Change layout…").onClick(() => {
        new DecisionLayoutPickerModal(this.app, this.view.map.layout, this.view.map.background, async (layout) => {
          await this.view.applyLayout(layout);
          layoutSetting.setDesc(`Current: ${layoutLabel(layout)}`);
        }).open();
      }));
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
    new Setting(contentEl)
      .setName("Dim unselected branches")
      .setDesc("When a non-root node is selected, fade branches outside its path and descendants")
      .addToggle((toggle) => toggle
        .setValue(this.values.dimUnselectedBranches)
        .onChange((value) => { this.values.dimUnselectedBranches = value; }));
    new Setting(contentEl)
      .setName("Dim strength")
      .setDesc("0% leaves unrelated branches unchanged; 90% makes them very faint")
      .addSlider((slider) => slider
        .setLimits(0, 90, 5)
        .setValue(this.values.dimStrength)
        .setDynamicTooltip()
        .onChange((value) => { this.values.dimStrength = value; }));
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

class PresentationPreviewModal extends Modal {
  constructor(app, options) {
    super(app);
    this.pdf = options.pdf;
    this.svgs = options.svgs;
    this.suggestedName = options.suggestedName;
    this.onSave = options.onSave;
    this.previewUrls = [];
    this.previewSheets = [];
    this.previewZoom = 1;
  }

  onOpen() {
    this.modalEl.addClass("kdh-presentation-preview-modal");
    const { contentEl } = this;
    contentEl.empty();
    const header = contentEl.createDiv({ cls: "kdh-presentation-preview-header" });
    const heading = header.createDiv({ cls: "kdh-presentation-preview-heading" });
    heading.createEl("h2", { text: "Presentation preview" });
    heading.createEl("p", {
      cls: "kdh-presentation-preview-help",
      text: `Letter size · 8.5 × 11 inches · ${this.svgs.length === 1 ? "one page" : `${this.svgs.length} pages`}`,
    });
    const zoomControls = header.createDiv({ cls: "kdh-presentation-preview-zoom" });
    const zoomOut = zoomControls.createEl("button", { cls: "clickable-icon", attr: { type: "button", "aria-label": "Zoom preview out" } });
    setIcon(zoomOut, "zoom-out");
    this.previewZoomLabel = zoomControls.createEl("button", {
      cls: "kdh-presentation-preview-zoom-label",
      text: "100%",
      attr: { type: "button", "aria-label": "Reset preview zoom to 100%", title: "Reset preview zoom to 100%" },
    });
    const zoomIn = zoomControls.createEl("button", { cls: "clickable-icon", attr: { type: "button", "aria-label": "Zoom preview in" } });
    setIcon(zoomIn, "zoom-in");
    zoomOut.addEventListener("click", () => this.setPreviewZoom(this.previewZoom - 0.25));
    this.previewZoomLabel.addEventListener("click", () => this.setPreviewZoom(1));
    zoomIn.addEventListener("click", () => this.setPreviewZoom(this.previewZoom + 0.25));
    this.previewZoomOutButton = zoomOut;
    this.previewZoomInButton = zoomIn;

    const stage = contentEl.createDiv({ cls: "kdh-presentation-preview-stage" });
    this.previewStage = stage;
    this.svgs.forEach((svg, index) => {
      const wrapper = stage.createDiv({ cls: "kdh-presentation-preview-sheet" });
      this.previewSheets.push(wrapper);
      wrapper.createDiv({ cls: "kdh-presentation-preview-page-label", text: `Page ${index + 1} of ${this.svgs.length}` });
      const page = wrapper.createDiv({ cls: "kdh-presentation-preview-page" });
      const previewUrl = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
      this.previewUrls.push(previewUrl);
      page.createEl("img", { attr: { src: previewUrl, alt: `Preview of decision presentation page ${index + 1}` } });
    });
    this.setPreviewZoom(1);

    const footer = contentEl.createDiv({ cls: "kdh-presentation-preview-footer" });
    footer.createDiv({ cls: "kdh-presentation-preview-filename", text: this.suggestedName });
    const actions = footer.createDiv({ cls: "kdh-presentation-preview-actions" });
    actions.createEl("button", { text: "Cancel" }).addEventListener("click", () => this.close());
    const saveButton = actions.createEl("button", { text: "Save PDF", cls: "mod-cta" });
    saveButton.addEventListener("click", async () => {
      saveButton.disabled = true;
      try {
        const saved = await this.onSave(this.pdf, this.suggestedName);
        if (saved) this.close();
      } catch (error) {
        console.error("Decision Helper presentation save failed", error);
        new Notice("The presentation PDF could not be saved.");
      } finally {
        saveButton.disabled = false;
      }
    });
  }

  setPreviewZoom(nextZoom) {
    const stage = this.previewStage;
    const previousWidth = stage?.scrollWidth || 1;
    const previousHeight = stage?.scrollHeight || 1;
    const centerX = stage ? (stage.scrollLeft + stage.clientWidth / 2) / previousWidth : 0.5;
    const centerY = stage ? (stage.scrollTop + stage.clientHeight / 2) / previousHeight : 0;
    this.previewZoom = Math.max(0.5, Math.min(2, Math.round(nextZoom * 4) / 4));
    this.previewSheets.forEach((sheet) => { sheet.style.zoom = String(this.previewZoom); });
    this.previewZoomLabel?.setText(`${Math.round(this.previewZoom * 100)}%`);
    if (this.previewZoomOutButton) this.previewZoomOutButton.disabled = this.previewZoom <= 0.5;
    if (this.previewZoomInButton) this.previewZoomInButton.disabled = this.previewZoom >= 2;
    if (stage) {
      requestAnimationFrame(() => {
        stage.scrollLeft = Math.max(0, centerX * stage.scrollWidth - stage.clientWidth / 2);
        stage.scrollTop = Math.max(0, centerY * stage.scrollHeight - stage.clientHeight / 2);
      });
    }
  }

  onClose() {
    this.previewUrls.forEach((url) => URL.revokeObjectURL(url));
    this.previewUrls = [];
    this.previewSheets = [];
    this.previewStage = null;
    this.previewZoomLabel = null;
    this.previewZoomOutButton = null;
    this.previewZoomInButton = null;
    this.contentEl.empty();
  }
}

class DecisionHelperSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "The Kempf Simple Decision Helper options" });
    new Setting(containerEl)
      .setName("Default background")
      .setDesc("Background used when creating a new .ksdh decision.")
      .addDropdown((dropdown) => dropdown
        .addOption("system", "Obsidian Default")
        .addOption("dark", "Dark")
        .addOption("paper", "Paper")
        .setValue(normalizeBackground(this.plugin.settings.defaultBackground))
        .onChange(async (value) => {
          this.plugin.settings.defaultBackground = value;
          await this.plugin.saveSettings();
        }));
    new Setting(containerEl)
      .setName("Default layout")
      .setDesc("Layout used when creating a new .ksdh decision. Existing decisions keep their own layout.")
      .addButton((button) => button
        .setButtonText(`Change… (${layoutLabel(this.plugin.settings.defaultLayout)})`)
        .onClick(() => {
          new DecisionLayoutPickerModal(this.app, this.plugin.settings.defaultLayout, this.plugin.settings.defaultBackground, async (layout) => {
            this.plugin.settings.defaultLayout = layout;
            await this.plugin.saveSettings();
            this.display();
          }).open();
        }));
    new Setting(containerEl)
      .setName("Confirm before deleting")
      .setDesc("Ask before deleting a node and everything beneath it.")
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.confirmDelete)
        .onChange(async (value) => {
          this.plugin.settings.confirmDelete = value;
          await this.plugin.saveSettings();
        }));

    const folders = this.app.vault.getAllLoadedFiles()
      .filter((file) => file instanceof TFolder && file.path !== "/")
      .sort((a, b) => a.path.localeCompare(b.path));

    containerEl.createEl("h3", { text: "New decision folder" });

    new Setting(containerEl)
      .setName("Use an existing folder")
      .setDesc("Choose where new .ksdh decisions are saved. To use a folder that does not exist yet, create it below.")
      .addDropdown((dropdown) => {
        dropdown.addOption("", "Vault root");
        folders.forEach((folder) => dropdown.addOption(folder.path, folder.path));
        const selectedFolder = folders.some((folder) => folder.path === this.plugin.settings.defaultFolder)
          ? this.plugin.settings.defaultFolder
          : "";
        dropdown.setValue(selectedFolder || "");
        dropdown.onChange(async (value) => {
          this.plugin.settings.defaultFolder = value;
          await this.plugin.saveSettings();
        });
      });

    let newFolderPath = "";
    new Setting(containerEl)
      .setName("Create a new folder")
      .setDesc("Type a folder name or path. The plugin will create it in your vault and immediately use it for new decisions. Nested folders are supported.")
      .addText((text) => {
        text.setPlaceholder("Decisions or Projects/Decisions");
        text.onChange((value) => { newFolderPath = value; });
      })
      .addButton((button) => {
        button.setButtonText("Create folder and use it").setCta().onClick(async () => {
          const cleanPath = normalizePath(newFolderPath.trim().replace(/^\/+|\/+$/g, ""));
          if (!cleanPath || cleanPath === ".") {
            new Notice("Enter a folder name first.");
            return;
          }
          const createdPath = await this.plugin.createFolderPath(cleanPath);
          if (createdPath === null) return;
          this.plugin.settings.defaultFolder = createdPath;
          await this.plugin.saveSettings();
          new Notice(`New decisions will be saved in ${createdPath}.`);
          this.display();
        });
      });
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
    this.focusedId = null;
    this.pinnedInfoNodeId = null;
    this.searchPanelEl = null;
    this.searchMatches = [];
    this.searchIndex = -1;
  }

  getViewType() { return VIEW_TYPE; }
  getDisplayText() { return this.file?.basename || "The Kempf Simple Decision Helper"; }
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
        const isFactor = node.type === "benefit" || node.type === "risk";
        node.notes = isFactor ? String(node.notes || "") : "";
        delete node.relatedNotes;
        delete node.sourceUrl;
        node.childIds = Array.isArray(node.childIds) ? node.childIds : [];
      }
      const rootNode = parsed.nodes.find((node) => node.id === parsed.rootId);
      if (!rootNode || rootNode.type !== "decision") throw new Error("Missing Decision node");
      const storedCanvasSpace = Number(parsed.canvasSpace);
      const previousCanvasSpace = storedCanvasSpace === CANVAS_SPACE
        ? CANVAS_SPACE
        : (LEGACY_CANVAS_SPACES.has(storedCanvasSpace) ? storedCanvasSpace : 1200);
      const canvasShift = CANVAS_SPACE - previousCanvasSpace;
      const savedZoom = Math.max(MIN_ZOOM, Math.min(2, Number(parsed.zoom) || 1));
      if (parsed.nodeInfoCollapsed === undefined && typeof parsed.selectedDetailsOpen === "boolean") {
        parsed.nodeInfoCollapsed = !parsed.selectedDetailsOpen;
      }
      delete parsed.selectedDetailsOpen;
      this.map = { ...emptyMap(), ...parsed, layout: normalizeLayout(parsed.layout), background: normalizeBackground(parsed.background), canvasSpace: CANVAS_SPACE, formatVersion: FORMAT_VERSION };
      this.pinnedInfoNodeId = null;
      if (canvasShift && Number.isFinite(parsed.scrollLeft) && Number.isFinite(parsed.scrollTop)) {
        this.map.scrollLeft = Math.max(0, parsed.scrollLeft + canvasShift * savedZoom);
        this.map.scrollTop = Math.max(0, parsed.scrollTop + canvasShift * savedZoom);
      }
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
      for (const node of this.map.nodes) {
        node.collapsed = Boolean(node.collapsed && node.childIds.length);
        node.locked = Boolean(node.locked);
      }
      if (this.focusedId && !byId.has(this.focusedId)) this.focusedId = null;
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
    this.closeNodeSearch(false);
    this.clearLongPressHandlers();
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
    this.clearLongPressHandlers();
    const root = this.containerEl.children[1];
    root.empty();
    root.addClass("kdh-view");
    root.toggleClass("kdh-layout-linear", String(this.map.layout).startsWith("linear-"));
    root.removeClass("kdh-background-paper");
    root.removeClass("kdh-background-dark");
    const background = normalizeBackground(this.map.background);
    if (background === "paper" || background === "dark") root.addClass(`kdh-background-${background}`);
    const dimStrength = Math.min(90, Math.max(0, Number(this.map.dimStrength) || 0));
    root.style.setProperty("--kdh-dim-opacity", String(1 - dimStrength / 100));
    this.syncSearchPanelBackground();

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
      empty.createEl("button", { text: "Create decision", cls: "mod-cta" })
        .addEventListener("click", () => this.promptForDecision());
      return;
    }

    this.renderToolbar(root);
    const scroller = root.createDiv({ cls: "kdh-scroller" });
    const canvas = scroller.createDiv({ cls: "kdh-canvas" });
    const layout = this.calculateLayout();
    this.nodePositions = layout.positions;
    const zoom = Math.max(MIN_ZOOM, Math.min(2, this.map.zoom || 1));
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
        const fittedZoom = Math.max(MIN_ZOOM, Math.min(1, (scroller.clientWidth - 90) / (maxX - minX), (scroller.clientHeight - 90) / (maxY - minY)));
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
    addButton("maximize", "Fit decision", () => this.fitDecision());
    addButton("search", "Search nodes", () => this.showNodeSearch());
    addButton("settings-2", "Decision options", () => new DecisionOptionsModal(this.app, this).open());
    if (this.focusedId) {
      const focused = this.getNode(this.focusedId);
      if (focused) {
        const hiddenCount = this.map.nodes.filter((node) => !this.isVisibleInFocus(node.id)).length;
        const status = toolbar.createDiv({ cls: "kdh-focus-status" });
        status.createSpan({
          cls: "kdh-focus-status-label",
          text: `Focused: ${focused.text} · ${hiddenCount} hidden`,
          attr: { title: `Focused branch: ${focused.text}` },
        });
        status.createEl("button", { text: "Unfocus", cls: "kdh-focus-exit" })
          .addEventListener("click", () => this.clearBranchFocus());
      }
    }
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
    const summaryCollapsed = this.map.summaryCollapsed === true;
    const panel = root.createDiv({ cls: `kdh-summary-panel${summaryCollapsed ? " is-collapsed" : ""}` });
    this.summaryPanel = panel;
    const header = panel.createDiv({ cls: "kdh-summary-header" });
    header.createSpan({ text: "Decision summary" });
    const toggle = header.createEl("button", {
      cls: "clickable-icon",
      attr: { "aria-label": summaryCollapsed ? "Expand decision summary" : "Collapse decision summary" },
    });
    setIcon(toggle, summaryCollapsed ? "chevron-down" : "chevron-up");
    toggle.addEventListener("click", () => {
      this.map.summaryCollapsed = !summaryCollapsed;
      this.saveMap();
      this.render();
    });
    if (!summaryCollapsed) this.renderSummaryContent(panel);
  }

  renderSummaryContent(panel = this.summaryPanel) {
    if (!panel || this.map.summaryCollapsed === true) return;
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

    let pinnedNode = this.pinnedInfoNodeId ? this.getNode(this.pinnedInfoNodeId) : null;
    if (this.pinnedInfoNodeId && (!pinnedNode || pinnedNode.type === "decision")) {
      this.pinnedInfoNodeId = null;
      pinnedNode = null;
    }
    const infoNode = pinnedNode || (selected?.type !== "decision" ? selected : null);
    if (infoNode) this.renderNodeInfo(content, infoNode, Boolean(pinnedNode));
  }

  renderNodeInfo(content, node, pinned) {
    const collapsed = this.map.nodeInfoCollapsed === true;
    const box = content.createDiv({ cls: `kdh-selected-details${collapsed ? " is-collapsed" : ""}` });
    const header = box.createDiv({ cls: "kdh-selected-details-header" });
    header.createSpan({ text: pinned ? "Pinned node" : "Selected node" });
    const actions = header.createDiv({ cls: "kdh-selected-details-actions" });
    const pin = actions.createEl("button", {
      cls: `clickable-icon kdh-node-info-pin${pinned ? " is-active" : ""}`,
      attr: { "aria-label": pinned ? "Unpin node information" : "Pin node information" },
    });
    setIcon(pin, "pin");
    pin.addEventListener("click", () => {
      this.pinnedInfoNodeId = pinned ? null : node.id;
      this.renderSummaryContent();
    });
    const collapse = actions.createEl("button", {
      cls: "clickable-icon kdh-node-info-collapse",
      attr: { "aria-label": collapsed ? "Expand node information" : "Collapse node information" },
    });
    setIcon(collapse, collapsed ? "chevron-down" : "chevron-up");
    collapse.addEventListener("click", async () => {
      this.map.nodeInfoCollapsed = !collapsed;
      await this.saveMap();
      this.renderSummaryContent();
    });
    if (collapsed) return;
    const detailBody = box.createDiv({ cls: "kdh-selected-details-body" });
    this.renderSelectedNodeSummary(detailBody, node);
  }

  selectFromSummary(node) {
    if (this.focusedId && !this.isVisibleInFocus(node.id)) {
      this.focusedId = null;
      this.render();
    }
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
      element.toggleClass("is-dimmed", this.shouldDimNode(element.dataset.nodeId));
      element.setAttribute("aria-selected", selected ? "true" : "false");
    });
    this.currentCanvas?.querySelectorAll(".kdh-line, .kdh-edge-label").forEach((element) => {
      element.toggleClass("is-dimmed", this.shouldDimNode(element.dataset.nodeId));
    });
    this.summaryContentEl?.querySelectorAll(".kdh-comparison-row").forEach((element) => {
      element.toggleClass("is-selected", element.dataset.nodeId === selectedId);
    });
  }

  isDescendant(candidateId, ancestorId) {
    let current = this.getNode(candidateId);
    while (current?.parentId) {
      if (current.parentId === ancestorId) return true;
      current = this.getNode(current.parentId);
    }
    return false;
  }

  shouldDimNode(nodeId) {
    if (this.map.dimUnselectedBranches === false) return false;
    const selected = this.getNode(this.map.selectedId);
    if (!selected?.parentId) return false;
    if (nodeId === selected.id) return false;
    if (this.isDescendant(nodeId, selected.id)) return false;
    if (this.isDescendant(selected.id, nodeId)) return false;
    return true;
  }

  isVisibleInFocus(nodeId) {
    if (!this.focusedId) return true;
    if (nodeId === this.focusedId || this.isDescendant(nodeId, this.focusedId)) return true;
    return this.isDescendant(this.focusedId, nodeId);
  }

  focusBranch(nodeId) {
    const node = this.getNode(nodeId);
    if (!node?.parentId) return;
    this.rememberViewport();
    this.focusedId = nodeId;
    this.map.selectedId = nodeId;
    this.render();
  }

  clearBranchFocus() {
    if (!this.focusedId) return;
    this.rememberViewport();
    this.focusedId = null;
    this.render();
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

  fitDecision() {
    const scroller = this.currentScroller;
    const canvas = this.currentCanvas;
    if (!scroller || !canvas || !this.nodePositions?.size) return;
    const positions = [...this.nodePositions.entries()]
      .filter(([id]) => this.isVisibleInFocus(id))
      .map(([, position]) => position);
    if (!positions.length) return;
    const minX = Math.min(...positions.map((position) => position.x));
    const maxX = Math.max(...positions.map((position) => position.x + CARD_WIDTH));
    const minY = Math.min(...positions.map((position) => position.y));
    const maxY = Math.max(...positions.map((position) => position.y + CARD_HEIGHT + SCORE_FOOTER_HEIGHT));
    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);
    const padding = 110;
    const zoom = Math.max(MIN_ZOOM, Math.min(1, (scroller.clientWidth - padding) / width, (scroller.clientHeight - padding) / height));
    this.map.zoom = zoom;
    canvas.style.zoom = String(zoom);
    scroller.scrollLeft = Math.max(0, ((minX + maxX) / 2) * zoom - scroller.clientWidth / 2);
    scroller.scrollTop = Math.max(0, ((minY + maxY) / 2) * zoom - scroller.clientHeight / 2);
    this.map.scrollLeft = scroller.scrollLeft;
    this.map.scrollTop = scroller.scrollTop;
    this.updateToolbar();
    this.saveMap();
  }

  findNodeMatches(query) {
    const normalized = String(query || "").trim().toLocaleLowerCase();
    if (!normalized) return [];
    return this.map.nodes
      .filter((node) => node.text.toLocaleLowerCase().includes(normalized))
      .map((node) => node.id);
  }

  showNodeSearch() {
    if (this.searchPanelEl?.isConnected) {
      this.searchInputEl?.focus();
      this.searchInputEl?.select();
      return;
    }
    const panel = this.containerEl.createDiv({ cls: "kdh-search-panel", attr: { role: "dialog", "aria-label": "Search nodes" } });
    const header = panel.createDiv({ cls: "kdh-search-header" });
    header.createEl("strong", { text: "Search nodes" });
    const close = header.createEl("button", { text: "×", attr: { type: "button", "aria-label": "Close search" } });
    const body = panel.createDiv({ cls: "kdh-search-body" });
    const input = body.createEl("input", { attr: { type: "search", placeholder: "Find node title…", "aria-label": "Search node titles" } });
    const controls = body.createDiv({ cls: "kdh-search-controls" });
    const status = controls.createSpan({ cls: "kdh-search-status", text: "Type to search" });
    const previous = controls.createEl("button", { text: "‹", attr: { type: "button", "aria-label": "Previous match" } });
    const next = controls.createEl("button", { text: "›", attr: { type: "button", "aria-label": "Next match" } });
    this.searchPanelEl = panel;
    this.searchInputEl = input;
    this.searchStatusEl = status;
    this.searchPreviousButton = previous;
    this.searchNextButton = next;
    this.searchMatches = [];
    this.searchIndex = -1;
    this.syncSearchPanelBackground();

    const updateQuery = () => {
      this.searchMatches = this.findNodeMatches(input.value);
      this.searchIndex = this.searchMatches.length ? 0 : -1;
      this.updateSearchPanelStatus();
      if (this.searchIndex >= 0) this.revealSearchMatch(this.searchMatches[this.searchIndex]);
    };
    input.addEventListener("input", updateQuery);
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        this.moveSearchMatch(event.shiftKey ? -1 : 1);
      } else if (event.key === "Escape") {
        event.preventDefault();
        this.closeNodeSearch();
      }
    });
    previous.addEventListener("click", () => this.moveSearchMatch(-1));
    next.addEventListener("click", () => this.moveSearchMatch(1));
    close.addEventListener("click", () => this.closeNodeSearch());
    this.installSearchPanelDragging(header, close);
    this.updateSearchPanelStatus();
    setTimeout(() => input.focus(), 0);
  }

  closeNodeSearch(restoreFocus = true) {
    this.searchDragCleanup?.();
    this.searchDragCleanup = null;
    this.searchPanelEl?.remove();
    this.searchPanelEl = null;
    this.searchInputEl = null;
    this.searchStatusEl = null;
    this.searchPreviousButton = null;
    this.searchNextButton = null;
    this.searchMatches = [];
    this.searchIndex = -1;
    if (restoreFocus) this.containerEl.focus();
  }

  syncSearchPanelBackground() {
    if (!this.searchPanelEl) return;
    this.searchPanelEl.removeClass("kdh-background-paper");
    this.searchPanelEl.removeClass("kdh-background-dark");
    const background = normalizeBackground(this.map.background);
    if (background === "paper" || background === "dark") this.searchPanelEl.addClass(`kdh-background-${background}`);
  }

  updateSearchPanelStatus() {
    const count = this.searchMatches.length;
    if (this.searchStatusEl) this.searchStatusEl.setText(count ? `${this.searchIndex + 1} of ${count}` : (this.searchInputEl?.value.trim() ? "No matches" : "Type to search"));
    if (this.searchPreviousButton) this.searchPreviousButton.disabled = count < 2;
    if (this.searchNextButton) this.searchNextButton.disabled = count < 2;
  }

  moveSearchMatch(direction) {
    if (!this.searchMatches.length) return;
    this.searchIndex = (this.searchIndex + direction + this.searchMatches.length) % this.searchMatches.length;
    this.updateSearchPanelStatus();
    this.revealSearchMatch(this.searchMatches[this.searchIndex]);
  }

  async revealSearchMatch(nodeId) {
    const node = this.getNode(nodeId);
    if (!node) return;
    let changed = false;
    let ancestor = node.parentId ? this.getNode(node.parentId) : null;
    while (ancestor) {
      if (ancestor.collapsed) {
        if (!changed) this.recordHistory();
        ancestor.collapsed = false;
        changed = true;
      }
      ancestor = ancestor.parentId ? this.getNode(ancestor.parentId) : null;
    }
    if (this.focusedId && !this.isVisibleInFocus(nodeId)) this.focusedId = null;
    this.map.selectedId = nodeId;
    await this.saveMap();
    this.render();
    requestAnimationFrame(() => {
      this.revealNode(nodeId);
      this.keepSearchMatchClearOfPanel(nodeId);
      this.searchInputEl?.focus();
    });
  }

  keepSearchMatchClearOfPanel(nodeId) {
    const panel = this.searchPanelEl;
    const card = this.currentCanvas?.querySelector(`.kdh-node[data-node-id="${CSS.escape(nodeId)}"]`);
    const scroller = this.currentScroller;
    if (!panel?.isConnected || !card || !scroller) return;
    const panelRect = panel.getBoundingClientRect();
    const cardRect = card.getBoundingClientRect();
    const gap = 16;
    if (cardRect.right + gap <= panelRect.left || cardRect.left - gap >= panelRect.right || cardRect.bottom + gap <= panelRect.top || cardRect.top - gap >= panelRect.bottom) return;
    const shifts = [
      { x: cardRect.right - panelRect.left + gap, y: 0 },
      { x: cardRect.left - panelRect.right - gap, y: 0 },
      { x: 0, y: cardRect.bottom - panelRect.top + gap },
      { x: 0, y: cardRect.top - panelRect.bottom - gap },
    ].sort((a, b) => Math.hypot(a.x, a.y) - Math.hypot(b.x, b.y));
    scroller.scrollLeft += shifts[0].x;
    scroller.scrollTop += shifts[0].y;
    this.map.scrollLeft = scroller.scrollLeft;
    this.map.scrollTop = scroller.scrollTop;
  }

  installSearchPanelDragging(handle, closeButton) {
    let drag = null;
    const move = (event) => {
      if (!drag || !this.searchPanelEl) return;
      const maxLeft = Math.max(6, this.containerEl.clientWidth - this.searchPanelEl.offsetWidth - 6);
      const maxTop = Math.max(48, this.containerEl.clientHeight - this.searchPanelEl.offsetHeight - 6);
      this.searchPanelEl.style.left = `${Math.min(maxLeft, Math.max(6, drag.left + event.clientX - drag.x))}px`;
      this.searchPanelEl.style.top = `${Math.min(maxTop, Math.max(48, drag.top + event.clientY - drag.y))}px`;
    };
    const up = () => {
      drag = null;
      this.searchPanelEl?.removeClass("is-dragging");
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    const down = (event) => {
      if (event.button !== 0 || event.target === closeButton || !this.searchPanelEl) return;
      drag = { x: event.clientX, y: event.clientY, left: parseFloat(this.searchPanelEl.style.left) || 14, top: parseFloat(this.searchPanelEl.style.top) || 50 };
      this.searchPanelEl.addClass("is-dragging");
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
      event.preventDefault();
    };
    handle.addEventListener("pointerdown", down);
    this.searchDragCleanup = () => {
      handle.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }

  navigateSelection(key) {
    if (!this.nodePositions?.size) return;
    let selected = this.getNode(this.map.selectedId);
    if (!selected || !this.nodePositions.has(selected.id)) {
      selected = this.getNode(this.map.rootId);
      if (selected) this.selectNode(selected, true);
      return;
    }
    if ((this.map.layout || "").startsWith("staggered-")) {
      const axis = {
        ArrowLeft: { x: -1, y: 0 }, ArrowRight: { x: 1, y: 0 },
        ArrowUp: { x: 0, y: -1 }, ArrowDown: { x: 0, y: 1 },
      }[key];
      const current = this.nodePositions.get(selected.id);
      if (!axis || !current) return;
      const center = { x: current.x + CARD_WIDTH / 2, y: current.y + CARD_HEIGHT / 2 };
      let best = null;
      for (const [nodeId, position] of this.nodePositions) {
        if (nodeId === selected.id || !this.isVisibleInFocus(nodeId)) continue;
        const dx = position.x + CARD_WIDTH / 2 - center.x;
        const dy = position.y + CARD_HEIGHT / 2 - center.y;
        const forward = dx * axis.x + dy * axis.y;
        if (forward <= 1) continue;
        const sideways = Math.abs(dx * axis.y - dy * axis.x);
        const score = Math.hypot(dx, dy) + sideways * 2;
        if (!best || score < best.score) best = { node: this.getNode(nodeId), score };
      }
      if (best?.node) this.selectNode(best.node, true);
      return;
    }
    const parent = this.getNode(selected.parentId);
    const children = this.visibleChildren(selected).filter((node) => this.isVisibleInFocus(node.id));
    const siblings = parent ? this.visibleChildren(parent).filter((node) => this.isVisibleInFocus(node.id)) : [selected];
    const index = siblings.findIndex((node) => node.id === selected.id);
    const previous = index > 0 ? siblings[index - 1] : null;
    const next = index >= 0 && index < siblings.length - 1 ? siblings[index + 1] : null;
    const actions = {
      down: { ArrowUp: parent, ArrowDown: children[0], ArrowLeft: previous, ArrowRight: next },
      up: { ArrowDown: parent, ArrowUp: children[0], ArrowLeft: previous, ArrowRight: next },
      right: { ArrowLeft: parent, ArrowRight: children[0], ArrowUp: previous, ArrowDown: next },
      left: { ArrowRight: parent, ArrowLeft: children[0], ArrowUp: previous, ArrowDown: next },
      "linear-up-right": { ArrowLeft: parent, ArrowRight: children[0], ArrowUp: previous, ArrowDown: next },
      "linear-down-right": { ArrowLeft: parent, ArrowRight: children[0], ArrowUp: previous, ArrowDown: next },
      "linear-up-left": { ArrowRight: parent, ArrowLeft: children[0], ArrowUp: previous, ArrowDown: next },
      "linear-down-left": { ArrowRight: parent, ArrowLeft: children[0], ArrowUp: previous, ArrowDown: next },
      "linear-left-up": { ArrowDown: parent, ArrowUp: children[0], ArrowRight: previous, ArrowLeft: next },
      "linear-left-down": { ArrowUp: parent, ArrowDown: children[0], ArrowRight: previous, ArrowLeft: next },
      "linear-right-up": { ArrowDown: parent, ArrowUp: children[0], ArrowLeft: previous, ArrowRight: next },
      "linear-right-down": { ArrowUp: parent, ArrowDown: children[0], ArrowLeft: previous, ArrowRight: next },
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
    const incompletePaths = options.flatMap((entry) => (entry.totals.incompletePaths || [])
      .map((path) => `${entry.node.text} → ${path.text}`));
    if (incompletePaths.length) {
      const shown = incompletePaths.slice(0, 3).map((path) => `“${path}”`).join(", ");
      const remaining = incompletePaths.length > 3 ? ` and ${incompletePaths.length - 3} more` : "";
      return `All Paths incomplete: evaluate ${shown}${remaining}. Required paths without rated factors are excluded from the score.`;
    }
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

  factorHasEvidence(node) {
    return Boolean(node?.notes?.trim());
  }

  renderFactorEvidence(content, node) {
    if (!this.factorHasEvidence(node)) return;
    const evidence = content.createDiv({ cls: "kdh-factor-evidence" });
    evidence.createDiv({ cls: "kdh-summary-label", text: "Supporting evidence" });
    if (node.notes?.trim()) {
      evidence.createDiv({ cls: "kdh-evidence-notes", text: node.notes.trim() });
    }
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
      this.renderFactorEvidence(content, node);
      return;
    }
    const scoreRow = content.createDiv({ cls: `kdh-selected-factor-score is-${node.type}` });
    scoreRow.createSpan({ text: `${node.type === "benefit" ? "+" : "−"}${score}` });
    scoreRow.createSpan({ cls: "kdh-selected-factor-formula", text: `Likelihood ${node.likelihood} × impact ${node.impact}` });
    if (node.type === "risk" && node.isConstraint) content.createDiv({ cls: "kdh-summary-constraint", text: "This risk is a deal-breaker." });
    this.renderFactorEvidence(content, node);
  }

  addSummaryMetrics(content, totals) {
    const ratedForConfidence = totals.allRated ?? totals.rated;
    const unratedForConfidence = totals.allUnrated ?? totals.unrated;
    const totalFactors = ratedForConfidence + unratedForConfidence;
    const completeness = totalFactors ? Math.round((ratedForConfidence / totalFactors) * 100) : 0;
    const grid = content.createDiv({ cls: "kdh-summary-grid" });
    grid.createDiv({ cls: "is-benefit", text: totals.benefitPercent === null ? "Balance: unrated" : `${totals.benefitPercent}% benefit` });
    grid.createDiv({
      cls: `is-net${totals.score < 0 ? " is-negative" : ""}${totals.score === null ? " is-incomplete" : ""}`,
      text: totals.score === null ? "Not evaluated" : `Score ${totals.score >= 0 ? "+" : ""}${totals.score}`,
    });
    grid.createDiv({ cls: `is-complete${completeness < 100 ? " is-incomplete" : ""}`, text: `${ratedForConfidence}/${totalFactors} rated` });
    if (totals.highestRisk) {
      const risk = content.createDiv({ cls: "kdh-summary-risk" });
      risk.createSpan({ text: `Highest risk −${totals.highestRisk.score}: ` });
      risk.createSpan({ cls: "kdh-summary-risk-text", text: totals.highestRisk.text });
    }
    if (totals.disqualifyingRisk) content.createDiv({ cls: "kdh-summary-constraint", text: `Deal-breaker: ${totals.disqualifyingRisk.text}` });
    if (unratedForConfidence) content.createDiv({ cls: "kdh-summary-unrated", text: `${unratedForConfidence} factor${unratedForConfidence === 1 ? "" : "s"} still unrated` });
    if (totals.incompletePaths?.length) {
      content.createDiv({
        cls: "kdh-summary-unrated",
        text: `${totals.incompletePaths.length} required All Paths sub-option${totals.incompletePaths.length === 1 ? " is" : "s are"} still unevaluated: ${totals.incompletePaths.map((path) => path.text).join(", ")}`,
      });
    }
    if (totals.chosenOption) content.createDiv({ cls: "kdh-summary-path", text: `Best path: ${totals.chosenOption.text}` });
    if (totals.combinedOptions?.length) content.createDiv({ cls: "kdh-summary-path", text: `Combined: ${totals.combinedOptions.map((item) => item.text).join(", ")}` });
  }

  changeZoom(multiplier) {
    const scroller = this.currentScroller;
    if (!scroller || !this.currentCanvas) return;
    const oldZoom = this.map.zoom || 1;
    const nextZoom = Math.max(MIN_ZOOM, Math.min(2, oldZoom * multiplier));
    this.setZoomAt(nextZoom, scroller.clientWidth / 2, scroller.clientHeight / 2);
  }

  setZoomAt(nextZoom, focusX, focusY) {
    const scroller = this.currentScroller;
    const canvas = this.currentCanvas;
    if (!scroller || !canvas) return;
    const oldZoom = this.map.zoom || 1;
    nextZoom = Math.max(MIN_ZOOM, Math.min(2, nextZoom));
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
    const modal = new CreateDecisionModal(this.app, this.plugin.settings, async (text, templateId) => {
        this.map = createDecisionMapFromTemplate(this.plugin.settings, text, templateId);
        await this.saveMap();
        this.render();
    });
    const originalClose = modal.onClose.bind(modal);
    modal.onClose = () => { originalClose(); this.promptOpen = false; };
    modal.open();
  }

  makeNode({ text, type, parentId, relationship, likelihood = 1, impact = 1, isConstraint = false, subOptionMode = "alternative", notes = "" }) {
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
      notes,
      collapsed: false,
      locked: false,
      childIds: [],
    };
  }

  getNode(id) { return this.map.nodes.find((node) => node.id === id); }

  lockingNodeId(nodeId) {
    let current = this.getNode(nodeId);
    const visited = new Set();
    while (current && !visited.has(current.id)) {
      if (current.locked) return current.id;
      visited.add(current.id);
      current = this.getNode(current.parentId);
    }
    return null;
  }

  ensureEditable(nodeId) {
    if (!this.lockingNodeId(nodeId)) return true;
    new Notice("This branch is locked. Unlock it from the node menu before editing it.");
    return false;
  }

  async toggleBranchLock(node) {
    const lockingId = this.lockingNodeId(node.id);
    this.rememberViewport();
    this.recordHistory();
    if (lockingId) this.getNode(lockingId).locked = false;
    else node.locked = true;
    await this.saveMap();
    this.render();
    new Notice(lockingId ? "Branch unlocked." : "Branch locked against edits.");
  }

  rememberViewport() {
    this.map.scrollLeft = this.currentScroller?.scrollLeft ?? this.map.scrollLeft;
    this.map.scrollTop = this.currentScroller?.scrollTop ?? this.map.scrollTop;
  }

  clearLongPressHandlers() {
    this.longPressCancellers.forEach((cancel) => cancel());
    this.longPressCancellers.clear();
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
    if (this.lockingNodeId(node.id) || this.lockingNodeId(parent.id)) return false;
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
    if (!this.ensureEditable(node.id) || !this.ensureEditable(newParent.id)) return;
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
    if (oldParent && !oldParent.childIds.length) oldParent.collapsed = false;
    newParent.collapsed = false;
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
    if (!this.ensureEditable(parent.id)) return;
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
    parent.collapsed = false;
    this.map.selectedId = pastedRoot.id;
    await this.saveMap();
    this.render();
  }

  addChild(parent, suggestedType = null) {
    if (!this.ensureEditable(parent.id)) return;
    if (parent.type !== "decision" && parent.type !== "option") {
      new Notice("Benefits and risks are final scoring factors and cannot have children.");
      return;
    }
    const defaultType = suggestedType || (parent.type === "option" ? "benefit" : "option");
    new NodeEditorModal(this.app, {
      heading: "Add connected item",
      type: defaultType,
      subOptionMode: "alternative",
      allowedTypes: parent.type === "decision" ? ["option"] : ["option", "benefit", "risk"],
      onSave: async (data) => {
        this.rememberViewport();
        this.recordHistory();
        const child = this.makeNode({ ...data, parentId: parent.id });
        this.map.nodes.push(child);
        parent.childIds.push(child.id);
        parent.collapsed = false;
        await this.saveMap();
        this.render();
      },
    }).open();
  }

  editNode(node) {
    if (!this.ensureEditable(node.id)) return;
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
      notes: node.notes,
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
    if (!this.ensureEditable(node.id)) return;
    new RelationshipModal(this.app, node.relationship, async (value) => {
      this.recordHistory();
      node.relationship = value;
      await this.saveMap();
      this.render();
    }).open();
  }

  async toggleBranch(node) {
    if (!node?.childIds?.length) return;
    const zoom = this.map.zoom || 1;
    const beforePosition = this.nodePositions?.get(node.id) || this.calculateLayout().positions.get(node.id);
    const beforeScrollLeft = this.currentScroller?.scrollLeft ?? this.map.scrollLeft ?? 0;
    const beforeScrollTop = this.currentScroller?.scrollTop ?? this.map.scrollTop ?? 0;
    const anchorX = beforePosition ? beforePosition.x * zoom - beforeScrollLeft : null;
    const anchorY = beforePosition ? beforePosition.y * zoom - beforeScrollTop : null;
    this.map.scrollLeft = beforeScrollLeft;
    this.map.scrollTop = beforeScrollTop;
    this.recordHistory();
    if (!node.collapsed && this.focusedId && this.focusedId !== node.id && this.isDescendant(this.focusedId, node.id)) {
      this.focusedId = null;
    }
    node.collapsed = !node.collapsed;
    this.map.selectedId = node.id;
    if (anchorX !== null && anchorY !== null) {
      const afterPosition = this.calculateLayout().positions.get(node.id);
      if (afterPosition) {
        this.map.scrollLeft = Math.max(0, afterPosition.x * zoom - anchorX);
        this.map.scrollTop = Math.max(0, afterPosition.y * zoom - anchorY);
      }
    }
    await this.saveMap();
    this.render();
  }

  nodeDepth(nodeId) {
    let depth = 0;
    let current = this.getNode(nodeId);
    const visited = new Set();
    while (current?.parentId && !visited.has(current.id)) {
      visited.add(current.id);
      current = this.getNode(current.parentId);
      depth += 1;
    }
    return depth;
  }

  mapMaximumDepth() {
    return this.map.nodes.reduce((maximum, node) => Math.max(maximum, this.nodeDepth(node.id)), 0);
  }

  mapCollapseWouldChange(mode, visibleLevel = 1) {
    return this.map.nodes.some((node) => {
      if (!node.childIds.length) return false;
      const shouldCollapse = mode === "collapse-all" || (mode === "collapse-level" && this.nodeDepth(node.id) >= visibleLevel);
      return Boolean(node.collapsed) !== shouldCollapse;
    });
  }

  branchExpansionWouldChange(node) {
    if (!node) return false;
    if (node.childIds.length && node.collapsed) return true;
    return node.childIds.some((id) => this.branchExpansionWouldChange(this.getNode(id)));
  }

  levelChooserWouldChangeMap() {
    const maximumLevel = this.mapMaximumDepth();
    for (let level = 1; level <= maximumLevel; level += 1) {
      if (this.mapCollapseWouldChange("collapse-level", level)) return true;
    }
    return false;
  }

  async expandEntireBranch(node) {
    const zoom = this.map.zoom || 1;
    const beforePosition = this.nodePositions?.get(node.id) || this.calculateLayout().positions.get(node.id);
    const beforeScrollLeft = this.currentScroller?.scrollLeft ?? this.map.scrollLeft ?? 0;
    const beforeScrollTop = this.currentScroller?.scrollTop ?? this.map.scrollTop ?? 0;
    const anchorX = beforePosition ? beforePosition.x * zoom - beforeScrollLeft : null;
    const anchorY = beforePosition ? beforePosition.y * zoom - beforeScrollTop : null;
    const visit = (current) => {
      if (!current) return;
      current.collapsed = false;
      current.childIds.forEach((id) => visit(this.getNode(id)));
    };
    this.map.scrollLeft = beforeScrollLeft;
    this.map.scrollTop = beforeScrollTop;
    this.recordHistory();
    visit(node);
    if (anchorX !== null && anchorY !== null) {
      const afterPosition = this.calculateLayout().positions.get(node.id);
      if (afterPosition) {
        this.map.scrollLeft = Math.max(0, afterPosition.x * zoom - anchorX);
        this.map.scrollTop = Math.max(0, afterPosition.y * zoom - anchorY);
      }
    }
    await this.saveMap();
    this.render();
  }

  async setMapCollapse(mode, visibleLevel = 1) {
    this.rememberViewport();
    this.recordHistory();
    for (const node of this.map.nodes) {
      if (!node.childIds.length) continue;
      node.collapsed = mode === "collapse-all" || (mode === "collapse-level" && this.nodeDepth(node.id) >= visibleLevel);
    }
    this.focusedId = null;
    await this.saveMap();
    this.render();
    requestAnimationFrame(() => this.fitDecision());
  }

  showCollapseToLevel() {
    const maximumLevel = this.mapMaximumDepth();
    if (maximumLevel < 1) return;
    new CollapseToLevelModal(this.app, maximumLevel, 1, (level) => this.mapCollapseWouldChange("collapse-level", level), (level) => {
      this.setMapCollapse("collapse-level", level);
    }).open();
  }

  addCollapseMenu(menu, node = null) {
    menu.addItem((item) => {
      item.setTitle("Collapse and expand").setIcon("list-tree");
      const submenu = item.setSubmenu();
      if (node?.childIds.length) {
        submenu.addItem((subitem) => subitem
          .setTitle(node.collapsed ? "Expand children" : "Collapse children")
          .setIcon(node.collapsed ? "chevrons-right" : "chevrons-down")
          .onClick(() => this.toggleBranch(node)));
        submenu.addItem((subitem) => subitem
          .setTitle("Expand entire branch")
          .setIcon("unfold-vertical")
          .setDisabled(!this.branchExpansionWouldChange(node))
          .onClick(() => this.expandEntireBranch(node)));
        submenu.addSeparator();
      }
      if (node) {
        submenu.addItem((subitem) => subitem
          .setTitle("Collapse map to selected level")
          .setDisabled(!this.mapCollapseWouldChange("collapse-level", this.nodeDepth(node.id)))
          .onClick(() => this.setMapCollapse("collapse-level", this.nodeDepth(node.id))));
      } else {
        submenu.addItem((subitem) => subitem
          .setTitle("Collapse to level…")
          .setDisabled(!this.levelChooserWouldChangeMap())
          .onClick(() => this.showCollapseToLevel()));
      }
      submenu.addItem((subitem) => subitem
        .setTitle("Collapse entire map")
        .setDisabled(!this.mapCollapseWouldChange("collapse-all"))
        .onClick(() => this.setMapCollapse("collapse-all")));
      submenu.addItem((subitem) => subitem
        .setTitle("Expand entire map")
        .setDisabled(!this.mapCollapseWouldChange("expand-all"))
        .onClick(() => this.setMapCollapse("expand-all")));
    });
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
    this.addCollapseMenu(menu, node);
    const lockingId = this.lockingNodeId(node.id);
    menu.addItem((item) => item
      .setTitle(lockingId ? "Unlock branch" : "Lock branch")
      .setIcon(lockingId ? "lock-open" : "lock")
      .onClick(() => this.toggleBranchLock(node)));
    menu.addItem((item) => item.setTitle("Edit node").setIcon("pencil").onClick(() => this.editNode(node)));
    if (node.parentId) {
      menu.addItem((item) => item
        .setTitle(this.focusedId === node.id ? "Unfocus branch" : "Focus branch")
        .setIcon(this.focusedId === node.id ? "scan-line" : "scan")
        .onClick(() => this.focusedId === node.id ? this.clearBranchFocus() : this.focusBranch(node.id)));
    }
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
    if (!this.ensureEditable(node.id)) return;
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
    if (this.focusedId && ids.has(this.focusedId)) this.focusedId = null;
    const parent = this.getNode(node.parentId);
    if (parent) parent.childIds = parent.childIds.filter((id) => id !== node.id);
    if (parent && !parent.childIds.length) parent.collapsed = false;
    this.map.nodes = this.map.nodes.filter((item) => !ids.has(item.id));
    await this.saveMap();
    this.render();
  }

  visibleChildren(node) {
    if (node.collapsed) return [];
    const sideOrder = { benefit: 0, option: 1, risk: 2 };
    return node.childIds
      .map((id) => this.getNode(id))
      .filter(Boolean)
      .sort((a, b) => (sideOrder[a.type] ?? 1) - (sideOrder[b.type] ?? 1));
  }

  handleShortcut(event) {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement || target instanceof HTMLButtonElement || target.closest?.("[contenteditable=true]")) return;
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "f") {
      event.preventDefault();
      this.showNodeSearch();
      return;
    }
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
    if (event.key === "Enter" || event.key === "Tab") {
      event.preventDefault();
      this.addChild(selected);
    } else if (event.key === "F2") {
      event.preventDefault();
      this.editNode(selected);
    } else if (event.key.toLowerCase() === "d" && selected.type === "option") {
      event.preventDefault();
      this.addChild(selected, "risk");
    } else if (event.key.toLowerCase() === "b" && selected.type === "option") {
      event.preventDefault();
      this.addChild(selected, "benefit");
    } else if (event.key === " " && selected.childIds.length) {
      event.preventDefault();
      this.toggleBranch(selected);
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
    const incompletePaths = [];
    const subOptionMode = node.subOptionMode === "combined" ? "combined" : "alternative";

    for (const childId of node.childIds) {
      const child = this.getNode(childId);
      if (!child) continue;
      if (child.type === "option") {
        const childTotals = this.totalsForOption(child, path);
        if (childTotals) childOptions.push({ node: child, totals: childTotals });
        else if (subOptionMode === "combined") incompletePaths.push({ id: child.id, text: child.text });
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
    let chosen = null;
    let combinedOptions = null;

    if (subOptionMode === "combined") {
      combinedOptions = node.childIds
        .map((id) => this.getNode(id))
        .filter((child) => child?.type === "option")
        .map((child) => ({ id: child.id, text: child.text }));
      for (const entry of childOptions) {
        benefits += entry.totals.benefits;
        risks += entry.totals.risks;
        rated += entry.totals.rated;
        unrated += entry.totals.unrated;
        factors += entry.totals.rated + entry.totals.unrated;
        if (entry.totals.highestRisk && (!highestRisk || entry.totals.highestRisk.score > highestRisk.score)) highestRisk = entry.totals.highestRisk;
        if (!disqualifyingRisk && entry.totals.disqualifyingRisk) disqualifyingRisk = entry.totals.disqualifyingRisk;
        incompletePaths.push(...(entry.totals.incompletePaths || []));
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
        incompletePaths.push(...(chosen.totals.incompletePaths || []));
      }
    }
    if (!factors && !allUnrated && !incompletePaths.length) return null;
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
      incompletePaths,
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

  showLayoutPicker() {
    new DecisionLayoutPickerModal(this.app, this.map.layout, this.map.background, (layout) => this.applyLayout(layout)).open();
  }

  async applyLayout(layout) {
    const normalized = normalizeLayout(layout);
    if (normalized === this.map.layout) return;
    this.rememberViewport();
    this.recordHistory();
    this.map.layout = normalized;
    this.map.scrollLeft = null;
    this.map.scrollTop = null;
    await this.saveMap();
    this.render();
  }

  showBackgroundMenu(event) {
    event.preventDefault();
    this.activeMenu?.hide?.();
    const menu = new Menu();
    this.activeMenu = menu;
    menu.addItem((item) => item.setTitle("Fit decision").setIcon("maximize").onClick(() => this.fitDecision()));
    menu.addItem((item) => item.setTitle("Search nodes").setIcon("search").onClick(() => this.showNodeSearch()));
    this.addCollapseMenu(menu);
    menu.addSeparator();
    if (this.focusedId) {
      menu.addItem((item) => item.setTitle("Unfocus branch").setIcon("scan-line").onClick(() => this.clearBranchFocus()));
      menu.addSeparator();
    }
    menu.addItem((item) => item
      .setTitle(`Change layout… (${layoutLabel(this.map.layout)})`)
      .setIcon("layout-template")
      .onClick(() => this.showLayoutPicker()));
    menu.addItem((item) => {
      item.setTitle("Background").setIcon("sun-moon");
      const submenu = item.setSubmenu();
      for (const [value, label] of [["system", "Obsidian Default"], ["dark", "Dark"], ["paper", "Paper"]]) {
        submenu.addItem((subitem) => subitem
          .setTitle(`${normalizeBackground(this.map.background) === value ? "✓ " : ""}${label}`)
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
      submenu.addItem((subitem) => subitem.setTitle("Presentation PDF").onClick(() => this.exportPresentationPdf()));
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
      totals.score === null
        ? `${pad}- Decision score: Not evaluated`
        : `${pad}- Decision score: ${totals.score >= 0 ? "+" : ""}${totals.score} (range −100 to +100)`,
      `${pad}- Benefits: ${totals.benefits}`,
      `${pad}- Risks: ${totals.risks}`,
      `${pad}- Net raw weight: ${totals.net >= 0 ? "+" : ""}${totals.net}`,
      `${pad}- Benefit share: ${totals.benefitPercent ?? "Not rated"}${totals.benefitPercent === null ? "" : "%"}`,
      `${pad}- Ratings completed: ${rated} of ${rated + unrated}`,
    ];
    if (totals.chosenOption) lines.push(`${pad}- Best path: ${this.markdownText(totals.chosenOption.text)}`);
    if (totals.combinedOptions?.length) lines.push(`${pad}- All Paths components: ${totals.combinedOptions.map((item) => this.markdownText(item.text)).join(", ")}`);
    if (totals.disqualifyingRisk) lines.push(`${pad}- Disqualified by deal-breaker: ${this.markdownText(totals.disqualifyingRisk.text)}`);
    if (totals.highestRisk) lines.push(`${pad}- Highest risk: −${totals.highestRisk.score} — ${this.markdownText(totals.highestRisk.text)}`);
    if (unrated) lines.push(`${pad}- Unrated factors: ${unrated}`);
    if (totals.incompletePaths?.length) lines.push(`${pad}- Unevaluated required paths: ${totals.incompletePaths.map((path) => this.markdownText(path.text)).join(", ")}`);
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
        if (node.notes?.trim()) {
          lines.push(`${pad}  - Supporting notes:`);
          for (const noteLine of node.notes.trim().split(/\r?\n/)) lines.push(`${pad}    > ${this.markdownText(noteLine)}`);
        }
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
      const isFactor = node.type === "benefit" || node.type === "risk";
      node.notes = isFactor ? String(node.notes || "") : "";
      delete node.relatedNotes;
      delete node.sourceUrl;
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
      for (const node of parsed.nodes) {
        node.collapsed = Boolean(node.collapsed && node.childIds.length);
        node.locked = Boolean(node.locked);
      }
    return { ...emptyMap(), ...parsed, layout: normalizeLayout(parsed.layout), formatVersion: FORMAT_VERSION };
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
    if (!totals || totals.score === null) return "Not evaluated";
    if (totals.disqualified) return "Blocked by deal-breaker";
    if (node.type === "decision") return totals.tiedOptions?.length > 1 ? "Tie" : `Leader: ${totals.chosenOption?.text || "None"} · ${totals.score >= 0 ? "+" : ""}${totals.score}`;
    return `Score ${totals.score >= 0 ? "+" : ""}${totals.score}`;
  }

  buildSvgExport() {
    const layout = this.calculateLayout();
    const entries = [...layout.positions.entries()].filter(([id]) => this.isVisibleInFocus(id));
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
    const background = normalizeBackground(this.map.background);
    const wantsLight = background === "paper" || (background === "system" && document.body?.classList?.contains("theme-light"));
    const palette = wantsLight
      ? { background: "#f7f3e8", card: "#fffdf7", text: "#25231f", muted: "#625e55", line: "#737064", label: "#f7f3e8", border: "#d2c8b2" }
      : { background: "#17181b", card: "#242529", text: "#f0f1f3", muted: "#a9adb5", line: "#b8bbc1", label: "#202125", border: "#43464d" };
    const accents = { decision: "#d89b32", option: "#3b91c8", benefit: "#58a85d", risk: "#c85c5c" };
    const dimStrength = Math.min(90, Math.max(0, Number(this.map.dimStrength) || 0));
    const dimOpacity = (1 - dimStrength / 100).toFixed(2);
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
      const geometry = this.edgeGeometry(parent, child, node.id, exportCardHeight);
      const linearEdge = geometry.linear;
      const linearStroke = linearEdge ? (accents[node.type] || accents.option) : null;
      parts.push(`<path d="${geometry.path}"${linearStroke ? ` stroke="${linearStroke}" stroke-width="4" stroke-linejoin="round"` : ""}${this.shouldDimNode(node.id) ? ` opacity="${dimOpacity}"` : ""}/>`);
    }
    parts.push(`</g>`);
    for (const node of this.map.nodes) {
      if (!node.parentId) continue;
      const parent = shifted.get(node.parentId);
      const child = shifted.get(node.id);
      if (!parent || !child) continue;
      const label = node.relationship || DEFAULT_RELATIONSHIPS[node.type] || "Related";
      const geometry = this.edgeGeometry(parent, child, node.id, exportCardHeight);
      const x = geometry.labelX;
      const y = geometry.labelY + 5;
      const labelWidth = Math.min(190, Math.max(58, label.length * 6.5 + 18));
      const dimmed = this.shouldDimNode(node.id) ? ` opacity="${dimOpacity}"` : "";
      parts.push(`<g${dimmed}><rect x="${x - labelWidth / 2}" y="${y - 12}" width="${labelWidth}" height="24" rx="12" fill="${palette.label}" stroke="${palette.border}"/>`);
      parts.push(`<text x="${x}" y="${y + 4}" text-anchor="middle" font-family="sans-serif" font-size="11" fill="${palette.text}">${this.escapeXml(label.length > 26 ? `${label.slice(0, 25)}…` : label)}</text></g>`);
    }
    for (const node of this.map.nodes) {
      const position = shifted.get(node.id);
      if (!position) continue;
      const accent = accents[node.type] || accents.option;
      parts.push(`<g${this.shouldDimNode(node.id) ? ` opacity="${dimOpacity}"` : ""}><title>${this.escapeXml(node.text)}</title>`);
      parts.push(`<rect x="${position.x}" y="${position.y}" width="${CARD_WIDTH}" height="${exportCardHeight}" rx="11" fill="${palette.card}" stroke="${node.isConstraint ? accents.risk : palette.border}" stroke-width="${node.type === "decision" ? 3 : 1.5}"/>`);
      parts.push(`<rect x="${position.x}" y="${position.y}" width="6" height="${exportCardHeight}" rx="3" fill="${accent}"/>`);
      parts.push(`<text x="${position.x + 18}" y="${position.y + 21}" font-family="sans-serif" font-size="10" font-weight="700" letter-spacing="1" fill="${accent}">${this.escapeXml((NODE_TYPES[node.type]?.label || node.type).toUpperCase())}</text>`);
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

  async jpegsToPdf(pages) {
    if (!pages.length) throw new Error("No presentation pages were created");
    const encoder = new TextEncoder();
    const objects = [
      encoder.encode("<< /Type /Catalog /Pages 2 0 R >>"),
      null,
    ];
    const pageReferences = [];
    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      const jpeg = new Uint8Array(await page.blob.arrayBuffer());
      const pageObject = 3 + index * 3;
      const imageObject = pageObject + 1;
      const contentObject = pageObject + 2;
      pageReferences.push(`${pageObject} 0 R`);
      const pdfWidth = 612;
      const pdfHeight = 792;
      const margin = 18;
      const scale = Math.min((pdfWidth - margin * 2) / page.pixelWidth, (pdfHeight - margin * 2) / page.pixelHeight);
      const drawWidth = page.pixelWidth * scale;
      const drawHeight = page.pixelHeight * scale;
      const drawX = (pdfWidth - drawWidth) / 2;
      const drawY = (pdfHeight - drawHeight) / 2;
      const content = `q\n${drawWidth.toFixed(3)} 0 0 ${drawHeight.toFixed(3)} ${drawX.toFixed(3)} ${drawY.toFixed(3)} cm\n/Im0 Do\nQ\n`;
      objects.push(encoder.encode(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pdfWidth} ${pdfHeight}] /Resources << /XObject << /Im0 ${imageObject} 0 R >> >> /Contents ${contentObject} 0 R >>`));
      objects.push({ prefix: encoder.encode(`<< /Type /XObject /Subtype /Image /Width ${page.pixelWidth} /Height ${page.pixelHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`), data: jpeg, suffix: encoder.encode("\nendstream") });
      objects.push(encoder.encode(`<< /Length ${encoder.encode(content).length} >>\nstream\n${content}endstream`));
    }
    objects[1] = encoder.encode(`<< /Type /Pages /Kids [${pageReferences.join(" ")}] /Count ${pages.length} >>`);
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

  buildPresentationSvg() {
    const pageWidth = 816;
    const pageHeight = 1056;
    const root = this.getNode(this.map.rootId);
    if (!root) throw new Error("The decision map is empty");
    const options = this.rankedTopLevelOptions();
    const eligible = options.filter((entry) => entry.totals.score !== null && !entry.totals.disqualified);
    const leader = eligible[0] || options[0] || null;
    const tied = leader && eligible.filter((entry) => entry.totals.score === leader.totals.score);
    const needsMoreInfo = !eligible.length;
    const warning = leader ? this.importantWarning(options, leader, needsMoreInfo) : "Add at least one option to compare possible decisions.";
    const esc = (value) => this.escapeXml(value);
    const wrapAll = (value, maximum) => {
      const words = String(value ?? "").trim().split(/\s+/).filter(Boolean);
      const wrapped = [];
      let line = "";
      for (const word of words) {
        const pieces = word.length > maximum ? word.match(new RegExp(`.{1,${maximum}}`, "g")) : [word];
        for (const piece of pieces) {
          const proposed = line ? `${line} ${piece}` : piece;
          if (proposed.length <= maximum) line = proposed;
          else {
            if (line) wrapped.push(line);
            line = piece;
          }
        }
      }
      if (line) wrapped.push(line);
      return wrapped.length ? wrapped : [""];
    };
    const fixedText = (value, x, y, width, options = {}) => {
      const fontSize = options.fontSize || 14;
      const lineHeight = options.lineHeight || fontSize * 1.2;
      const weight = options.weight || 600;
      const fill = options.fill || "#172033";
      const maximum = Math.max(4, Math.floor(width / (fontSize * 0.54)));
      const wrapped = wrapAll(value, maximum);
      const anchor = options.anchor || "start";
      return {
        height: wrapped.length * lineHeight,
        lines: wrapped.length,
        svg: wrapped.map((line, index) => `<text x="${x}" y="${(y + fontSize + index * lineHeight).toFixed(2)}" text-anchor="${anchor}" font-family="Arial, sans-serif" font-size="${fontSize}" font-weight="${weight}" fill="${fill}">${esc(line)}</text>`).join(""),
      };
    };
    let resultLabel = "Not evaluated";
    let resultTitle = "More information needed";
    let resultDetail = "Add rated benefits and risks before relying on a recommendation.";
    let resultColor = "#d7a94a";
    if (leader && !needsMoreInfo) {
      const isTie = tied.length > 1;
      resultLabel = isTie ? "Current result · Tie" : "Current recommendation";
      resultTitle = isTie ? tied.map((entry) => entry.node.text).join(" · ") : leader.node.text;
      resultDetail = `${this.scoreDescription(leader.totals.score)} · Score ${leader.totals.score >= 0 ? "+" : ""}${leader.totals.score}`;
      resultColor = leader.totals.score < 0 ? "#c85c5c" : "#58a85d";
    } else if (leader?.totals.disqualified) {
      resultLabel = "Current result";
      resultTitle = "All evaluated paths are blocked";
      resultDetail = "Review the deal-breaker risks before deciding.";
      resultColor = "#c85c5c";
    }
    const resultFill = resultColor === "#58a85d" ? "#effaf1" : (resultColor === "#c85c5c" ? "#fff1f2" : "#fff8e6");
    const relevantFactors = this.map.nodes.filter((node) => {
      if (node.type !== "benefit" && node.type !== "risk") return false;
      return !leader || this.isDescendant(node.id, leader.node.id);
    });
    const strongestBenefits = relevantFactors
      .filter((node) => node.type === "benefit" && this.scoreForNode(node) !== null)
      .sort((a, b) => this.scoreForNode(b) - this.scoreForNode(a))
      .slice(0, 3);
    const greatestRisks = relevantFactors
      .filter((node) => node.type === "risk" && this.scoreForNode(node) !== null)
      .sort((a, b) => this.scoreForNode(b) - this.scoreForNode(a))
      .slice(0, 3);
    const strongestInBranch = (option, type) => this.map.nodes
      .filter((node) => node.type === type && this.isDescendant(node.id, option.id) && this.scoreForNode(node) !== null)
      .sort((a, b) => this.scoreForNode(b) - this.scoreForNode(a))[0] || null;

    const parts = [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}">`,
      `<rect width="${pageWidth}" height="${pageHeight}" fill="#ffffff"/>`,
      `<rect x="0" y="0" width="${pageWidth}" height="8" fill="#d89b32"/>`,
      `<text x="42" y="39" font-family="Arial, sans-serif" font-size="10" font-weight="700" letter-spacing="1.8" fill="#9a681b">DECISION BRIEF</text>`,
      `<text x="774" y="39" text-anchor="end" font-family="Arial, sans-serif" font-size="9" fill="#64748b">${esc(new Date().toLocaleDateString())}</text>`,
    ];
    const title = fixedText(root.text, 42, 54, 732, { fontSize: 26, lineHeight: 30, weight: 700 });
    parts.push(title.svg);
    const resultTitleText = fixedText(resultTitle, 62, 0, 620, { fontSize: 19, lineHeight: 22, weight: 700, fill: resultColor });
    const resultY = 54 + title.height + 12;
    const resultHeight = 58 + resultTitleText.height;
    parts.push(`<rect x="42" y="${resultY}" width="732" height="${resultHeight}" rx="10" fill="${resultFill}" stroke="${resultColor}" stroke-opacity="0.45"/>`);
    parts.push(`<rect x="42" y="${resultY}" width="5" height="${resultHeight}" rx="2.5" fill="${resultColor}"/>`);
    parts.push(`<text x="62" y="${resultY + 22}" font-family="Arial, sans-serif" font-size="9" font-weight="700" letter-spacing="1.1" fill="#64748b">${esc(resultLabel.toUpperCase())}</text>`);
    parts.push(fixedText(resultTitle, 62, resultY + 29, 620, { fontSize: 19, lineHeight: 22, weight: 700, fill: resultColor }).svg);
    parts.push(`<text x="754" y="${resultY + resultHeight - 14}" text-anchor="end" font-family="Arial, sans-serif" font-size="9" font-weight="700" fill="#64748b">${esc(resultDetail)}</text>`);

    let cursorY = resultY + resultHeight + 24;
    parts.push(`<text x="42" y="${cursorY}" font-family="Arial, sans-serif" font-size="10" font-weight="700" letter-spacing="1.3" fill="#475569">OPTION COMPARISON</text>`);
    parts.push(`<text x="580" y="${cursorY}" text-anchor="end" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#b94b4b">RISKS</text><text x="602" y="${cursorY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="8" fill="#64748b">0</text><text x="624" y="${cursorY}" font-family="Arial, sans-serif" font-size="8" font-weight="700" fill="#438448">BENEFITS</text>`);
    cursorY += 11;
    const shownOptions = options.slice(0, 6);
    if (!shownOptions.length) {
      parts.push(`<text x="54" y="${cursorY + 22}" font-family="Arial, sans-serif" font-size="11" fill="#64748b">No options have been added yet.</text>`);
      cursorY += 38;
    }
    shownOptions.forEach((entry) => {
      const totals = entry.totals;
      const name = fixedText(entry.node.text, 54, cursorY + 5, 390, { fontSize: 10.5, lineHeight: 12, weight: 600 });
      const rowHeight = Math.max(29, name.height + 10);
      const centerY = cursorY + rowHeight / 2;
      const rated = totals.rated || 0;
      const maximum = rated * 25;
      const riskWidth = maximum ? Math.min(132, (totals.risks / maximum) * 132) : 0;
      const benefitWidth = maximum ? Math.min(132, (totals.benefits / maximum) * 132) : 0;
      const score = totals.disqualified ? "BLOCKED" : (totals.score === null ? "NOT EVALUATED" : `${totals.score >= 0 ? "+" : ""}${totals.score}`);
      const scoreColor = totals.disqualified || totals.score < 0 ? "#b94b4b" : "#438448";
      const isLeader = !needsMoreInfo && tied?.some((item) => item.node.id === entry.node.id) && !totals.disqualified;
      const rowFill = totals.disqualified ? "#fff3f4" : (isLeader ? "#fff8e8" : "#f8fafc");
      const rowStroke = totals.disqualified ? "#f4b8bf" : (isLeader ? "#e6bd68" : "#e2e8f0");
      parts.push(`<rect x="42" y="${cursorY}" width="732" height="${rowHeight}" rx="6" fill="${rowFill}" stroke="${rowStroke}"/>`);
      parts.push(name.svg);
      parts.push(`<rect x="470" y="${centerY - 4}" width="132" height="7" rx="3.5" fill="#e2e8f0"/><rect x="602" y="${centerY - 4}" width="132" height="7" rx="3.5" fill="#e2e8f0"/>`);
      parts.push(`<rect x="${602 - riskWidth}" y="${centerY - 4}" width="${riskWidth}" height="7" rx="3.5" fill="#c85c5c"/><rect x="602" y="${centerY - 4}" width="${benefitWidth}" height="7" rx="3.5" fill="#58a85d"/><line x1="602" y1="${centerY - 7}" x2="602" y2="${centerY + 7}" stroke="#64748b"/>`);
      parts.push(`<text x="758" y="${centerY + 4}" text-anchor="end" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="${scoreColor}">${score}</text>`);
      cursorY += rowHeight + 5;
    });
    if (options.length > shownOptions.length) {
      parts.push(`<text x="54" y="${cursorY + 9}" font-family="Arial, sans-serif" font-size="9" fill="#64748b">+ ${options.length - shownOptions.length} additional option${options.length - shownOptions.length === 1 ? "" : "s"} in the full decision</text>`);
      cursorY += 17;
    }

    const warningText = fixedText(warning || "No critical warnings were detected from the current ratings.", 58, 0, 690, { fontSize: 10.5, lineHeight: 13, weight: 500, fill: "#475569" });
    const warningY = cursorY + 13;
    const warningHeight = 41 + warningText.height;
    parts.push(`<rect x="42" y="${warningY}" width="732" height="${warningHeight}" rx="8" fill="#fff9ea" stroke="#e7c46e"/>`);
    parts.push(`<text x="58" y="${warningY + 21}" font-family="Arial, sans-serif" font-size="9" font-weight="700" letter-spacing="1.1" fill="#8a651d">CHECK BEFORE DECIDING</text>`);
    parts.push(fixedText(warning || "No critical warnings were detected from the current ratings.", 58, warningY + 26, 690, { fontSize: 10.5, lineHeight: 13, weight: 500, fill: "#475569" }).svg);
    cursorY = warningY + warningHeight + 22;

    const evidenceSectionY = cursorY;
    const evidenceStartIndex = parts.length;
    const evidenceContext = leader ? `KEY EVIDENCE · ${leader.node.text}` : "KEY EVIDENCE";
    const evidenceHeading = fixedText(evidenceContext.toUpperCase(), 42, cursorY, 732, { fontSize: 9.5, lineHeight: 12, weight: 700, fill: "#475569" });
    parts.push(evidenceHeading.svg);
    cursorY += evidenceHeading.height + 8;
    const evidenceRows = (factors) => factors.length ? factors.map((factor) => {
      const label = fixedText(factor.text, 0, 0, 274, { fontSize: 9.5, lineHeight: 11, weight: 600 });
      return { factor, label, height: Math.max(26, label.height + (factor.isConstraint ? 10 : 2)) };
    }) : [];
    const benefitRows = evidenceRows(strongestBenefits);
    const riskRows = evidenceRows(greatestRisks);
    const evidenceHeight = Math.max(92, 42 + Math.max(benefitRows.reduce((sum, row) => sum + row.height, 0), riskRows.reduce((sum, row) => sum + row.height, 0)));
    parts.push(`<rect x="42" y="${cursorY}" width="356" height="${evidenceHeight}" rx="8" fill="#eff9f1" stroke="#9bcfa0"/><rect x="418" y="${cursorY}" width="356" height="${evidenceHeight}" rx="8" fill="#fff2f2" stroke="#e3aaaa"/>`);
    parts.push(`<text x="58" y="${cursorY + 23}" font-family="Arial, sans-serif" font-size="9" font-weight="700" letter-spacing="1" fill="#438448">STRONGEST BENEFITS</text><text x="434" y="${cursorY + 23}" font-family="Arial, sans-serif" font-size="9" font-weight="700" letter-spacing="1" fill="#a84646">GREATEST RISKS</text>`);
    const addEvidenceRows = (rows, x, color, sign, emptyText) => {
      if (!rows.length) {
        parts.push(fixedText(emptyText, x, cursorY + 37, 312, { fontSize: 9.5, lineHeight: 12, weight: 500, fill: "#64748b" }).svg);
        return;
      }
      let rowY = cursorY + 36;
      rows.forEach(({ factor, label, height }) => {
        const score = this.scoreForNode(factor);
        parts.push(`<rect x="${x}" y="${rowY}" width="36" height="20" rx="10" fill="${color}"/><text x="${x + 18}" y="${rowY + 14}" text-anchor="middle" font-family="Arial, sans-serif" font-size="9" font-weight="700" fill="#fff">${sign}${score}</text>`);
        parts.push(fixedText(factor.text, x + 45, rowY - 1, 265, { fontSize: 9.5, lineHeight: 11, weight: 600 }).svg);
        if (factor.isConstraint) parts.push(`<text x="${x + 45}" y="${rowY + label.height + 7}" font-family="Arial, sans-serif" font-size="7" font-weight="700" fill="#a84646">DEAL-BREAKER</text>`);
        rowY += height;
      });
    };
    addEvidenceRows(benefitRows, 58, "#58a85d", "+", "No rated benefits in this option yet.");
    addEvidenceRows(riskRows, 434, "#c85c5c", "−", "No rated risks in this option yet.");
    cursorY += evidenceHeight + 22;

    const snapshotSectionY = cursorY;
    const snapshotStartIndex = parts.length;
    parts.push(`<text x="42" y="${cursorY}" font-family="Arial, sans-serif" font-size="9.5" font-weight="700" letter-spacing="1.1" fill="#475569">LEADING OPTION SNAPSHOTS</text>`);
    cursorY += 13;
    const snapshotOptions = options.slice(0, 3);
    const snapshots = snapshotOptions.map((entry) => {
      const benefit = strongestInBranch(entry.node, "benefit");
      const risk = strongestInBranch(entry.node, "risk");
      return {
        entry,
        benefit,
        risk,
        title: fixedText(entry.node.text, 0, 0, 145, { fontSize: 9.5, lineHeight: 11, weight: 700 }),
        benefitText: fixedText(`+ ${benefit?.text || "No rated benefit"}`, 0, 0, 202, { fontSize: 8, lineHeight: 9.5, weight: 550, fill: "#438448" }),
        riskText: fixedText(`− ${risk?.text || "No rated risk"}`, 0, 0, 202, { fontSize: 8, lineHeight: 9.5, weight: 550, fill: "#a84646" }),
      };
    });
    const snapshotHeight = Math.max(70, ...snapshots.map((item) => 31 + item.title.height + item.benefitText.height + item.riskText.height));
    snapshots.forEach((item, index) => {
      const { entry, benefit, risk } = item;
      const x = 42 + index * 251;
      const score = entry.totals.disqualified ? "BLOCKED" : (entry.totals.score === null ? "N/A" : `${entry.totals.score >= 0 ? "+" : ""}${entry.totals.score}`);
      const scoreColor = entry.totals.disqualified || entry.totals.score < 0 ? "#b94b4b" : "#438448";
      const cardFill = entry.totals.disqualified || entry.totals.score < 0 ? "#fff3f4" : (entry.totals.score === null ? "#f8fafc" : "#f1faf3");
      const cardStroke = entry.totals.disqualified || entry.totals.score < 0 ? "#f4b8bf" : (entry.totals.score === null ? "#cbd5e1" : "#aed7b2");
      parts.push(`<rect x="${x}" y="${cursorY}" width="230" height="${snapshotHeight}" rx="8" fill="${cardFill}" stroke="${cardStroke}"/><rect x="${x}" y="${cursorY}" width="230" height="4" rx="2" fill="${scoreColor}"/>`);
      parts.push(fixedText(entry.node.text, x + 11, cursorY + 11, 145, { fontSize: 9.5, lineHeight: 11, weight: 700 }).svg);
      parts.push(`<text x="${x + 218}" y="${cursorY + 23}" text-anchor="end" font-family="Arial, sans-serif" font-size="10" font-weight="700" fill="${scoreColor}">${score}</text>`);
      const detailY = cursorY + 17 + item.title.height;
      parts.push(fixedText(`+ ${benefit?.text || "No rated benefit"}`, x + 11, detailY, 206, { fontSize: 8, lineHeight: 9.5, weight: 550, fill: "#438448" }).svg);
      parts.push(fixedText(`− ${risk?.text || "No rated risk"}`, x + 11, detailY + item.benefitText.height + 3, 206, { fontSize: 8, lineHeight: 9.5, weight: 550, fill: "#a84646" }).svg);
    });
    if (!snapshots.length) parts.push(`<text x="54" y="${cursorY + 24}" font-family="Arial, sans-serif" font-size="10" fill="#64748b">Add options to create comparison snapshots.</text>`);
    const continuationBodies = [];
    let snapshotContinuation = null;
    if (cursorY + snapshotHeight > 1000) {
      const moveEvidence = snapshotSectionY > 985;
      const sectionStartIndex = moveEvidence ? evidenceStartIndex : snapshotStartIndex;
      const sectionY = moveEvidence ? evidenceSectionY : snapshotSectionY;
      const continuedParts = parts.splice(sectionStartIndex);
      snapshotContinuation = `<g transform="translate(0 ${86 - sectionY})">${continuedParts.join("")}</g>`;
    }

    let remainingIndex = shownOptions.length;
    while (remainingIndex < options.length) {
      const body = [`<text x="42" y="74" font-family="Arial, sans-serif" font-size="18" font-weight="700" fill="#172033">Option comparison · continued</text>`];
      let rowY = 96;
      let added = 0;
      while (remainingIndex < options.length) {
        const entry = options[remainingIndex];
        const totals = entry.totals;
        const name = fixedText(entry.node.text, 58, rowY + 12, 520, { fontSize: 11, lineHeight: 13, weight: 650 });
        const rowHeight = Math.max(54, name.height + 32);
        if (added && rowY + rowHeight > 988) break;
        const score = totals.disqualified ? "BLOCKED" : (totals.score === null ? "NOT EVALUATED" : `${totals.score >= 0 ? "+" : ""}${totals.score}`);
        const scoreColor = totals.disqualified || totals.score < 0 ? "#b94b4b" : "#438448";
        const fill = totals.disqualified ? "#fff3f4" : (totals.score === null ? "#f8fafc" : "#f7faf8");
        body.push(`<rect x="42" y="${rowY}" width="732" height="${rowHeight}" rx="7" fill="${fill}" stroke="#dbe2ea"/>`);
        body.push(name.svg);
        body.push(`<text x="758" y="${rowY + 25}" text-anchor="end" font-family="Arial, sans-serif" font-size="11" font-weight="700" fill="${scoreColor}">${score}</text>`);
        body.push(`<text x="58" y="${rowY + rowHeight - 11}" font-family="Arial, sans-serif" font-size="9" fill="#438448">Benefits ${totals.benefits}</text><text x="145" y="${rowY + rowHeight - 11}" font-family="Arial, sans-serif" font-size="9" fill="#b94b4b">Risks ${totals.risks}</text><text x="215" y="${rowY + rowHeight - 11}" font-family="Arial, sans-serif" font-size="9" fill="#64748b">Rated ${totals.rated || 0}</text>`);
        rowY += rowHeight + 7;
        remainingIndex += 1;
        added += 1;
      }
      continuationBodies.push(body.join(""));
    }
    if (snapshotContinuation) continuationBodies.push(snapshotContinuation);

    const totalPages = 1 + continuationBodies.length;
    const footer = (pageNumber) => `<line x1="42" y1="1012" x2="774" y2="1012" stroke="#e2e8f0"/><text x="42" y="1033" font-family="Arial, sans-serif" font-size="8.5" fill="#64748b">Scores support judgment; they do not replace it.</text><text x="408" y="1033" text-anchor="middle" font-family="Arial, sans-serif" font-size="8.5" fill="#64748b">Page ${pageNumber} of ${totalPages}</text><text x="774" y="1033" text-anchor="end" font-family="Arial, sans-serif" font-size="8.5" font-weight="700" fill="#9a681b">THE KEMPF SIMPLE DECISION HELPER</text>`;
    parts.push(footer(1), `</svg>`);
    const continuationPages = continuationBodies.map((body, index) => [
      `<?xml version="1.0" encoding="UTF-8"?>`,
      `<svg xmlns="http://www.w3.org/2000/svg" width="${pageWidth}" height="${pageHeight}" viewBox="0 0 ${pageWidth} ${pageHeight}">`,
      `<rect width="${pageWidth}" height="${pageHeight}" fill="#ffffff"/><rect x="0" y="0" width="${pageWidth}" height="8" fill="#d89b32"/>`,
      `<text x="42" y="39" font-family="Arial, sans-serif" font-size="10" font-weight="700" letter-spacing="1.8" fill="#9a681b">DECISION BRIEF · CONTINUED</text>`,
      `<text x="774" y="39" text-anchor="end" font-family="Arial, sans-serif" font-size="9" fill="#64748b">${esc(new Date().toLocaleDateString())}</text>`,
      body,
      footer(index + 2),
      `</svg>`,
    ].join(""));
    return { svgs: [parts.join(""), ...continuationPages], width: pageWidth, height: pageHeight };
  }

  async exportPresentationPdf() {
    try {
      const { svgs, width, height } = this.buildPresentationSvg();
      const scale = Math.max(1, Math.min(2, 8000 / Math.max(width, height)));
      const pixelWidth = Math.round(width * scale);
      const pixelHeight = Math.round(height * scale);
      const jpgs = [];
      for (const svg of svgs) jpgs.push({ blob: await this.svgToJpegBlob(svg, width, height), pixelWidth, pixelHeight });
      const pdf = await this.jpegsToPdf(jpgs);
      const suggestedName = `${this.exportBaseName()} presentation.pdf`;
      new PresentationPreviewModal(this.app, {
        pdf,
        svgs,
        suggestedName,
        onSave: async (document, filename) => {
          const saved = await this.saveExportFile(document, filename, "application/pdf", "Presentation PDF", ["pdf"]);
          if (saved) new Notice("Presentation PDF exported.");
          return saved;
        },
      }).open();
    } catch (error) {
      console.error("Decision Helper presentation export failed", error);
      new Notice("The presentation PDF could not be created on this device.");
    }
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
    if (direction.startsWith("linear-")) return this.calculateLinearLayout(root, direction);
    if (direction.startsWith("staggered-")) return this.calculateStaggeredLayout(root, direction.slice("staggered-".length));
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

  directionalSubtreeLayout(root, direction) {
    const positions = new Map();
    const vertical = direction === "down" || direction === "up";
    const siblingPreset = this.map.siblingSpacing || "regular";
    const levelPreset = this.map.levelSpacing || "regular";
    const siblingGap = siblingPreset === "extended" ? 300 : (siblingPreset === "compact" ? 24 : (vertical ? VERTICAL_SIBLING_GAP : HORIZONTAL_SIBLING_GAP));
    const levelGap = levelPreset === "extended" ? 300 : (levelPreset === "compact" ? 55 : (vertical ? VERTICAL_LEVEL_GAP : HORIZONTAL_LEVEL_GAP));
    const crossStep = vertical ? CARD_WIDTH + siblingGap : CARD_HEIGHT + SCORE_FOOTER_HEIGHT + siblingGap;
    const depthStep = vertical ? CARD_HEIGHT + SCORE_FOOTER_HEIGHT + levelGap : CARD_WIDTH + levelGap;
    let leafIndex = 0;
    const place = (node, depth) => {
      const children = this.visibleChildren(node);
      let cross;
      if (!children.length) {
        cross = leafIndex * crossStep;
        leafIndex += 1;
      } else {
        const childCrosses = children.map((child) => place(child, depth + 1));
        cross = (childCrosses[0] + childCrosses[childCrosses.length - 1]) / 2;
      }
      const signedDepth = (direction === "up" || direction === "left" ? -1 : 1) * depth * depthStep;
      positions.set(node.id, {
        x: (vertical ? cross : signedDepth) - CARD_WIDTH / 2,
        y: (vertical ? signedDepth : cross) - CARD_HEIGHT / 2,
      });
      return cross;
    };
    place(root, 0);
    const values = [...positions.values()];
    return {
      positions,
      bounds: {
        minX: Math.min(...values.map((position) => position.x)),
        minY: Math.min(...values.map((position) => position.y)),
        maxX: Math.max(...values.map((position) => position.x + CARD_WIDTH)),
        maxY: Math.max(...values.map((position) => position.y + CARD_HEIGHT + SCORE_FOOTER_HEIGHT)),
      },
    };
  }

  finalizeLayoutPositions(positions) {
    const values = [...positions.values()];
    if (!values.length) return { positions, width: 760 + CANVAS_SPACE * 2, height: 520 + CANVAS_SPACE * 2 };
    const minX = Math.min(...values.map((position) => position.x));
    const minY = Math.min(...values.map((position) => position.y));
    const maxX = Math.max(...values.map((position) => position.x + CARD_WIDTH));
    const maxY = Math.max(...values.map((position) => position.y + CARD_HEIGHT + SCORE_FOOTER_HEIGHT));
    const spanWidth = maxX - minX;
    const spanHeight = maxY - minY;
    const contentWidth = Math.max(760, spanWidth + TREE_MARGIN * 2);
    const contentHeight = Math.max(520, spanHeight + TREE_MARGIN * 2);
    const offsetX = CANVAS_SPACE + (contentWidth - spanWidth) / 2 - minX;
    const offsetY = CANVAS_SPACE + (contentHeight - spanHeight) / 2 - minY;
    for (const position of positions.values()) {
      position.x += offsetX;
      position.y += offsetY;
    }
    return { positions, width: contentWidth + CANVAS_SPACE * 2, height: contentHeight + CANVAS_SPACE * 2 };
  }

  calculateStaggeredLayout(root, direction) {
    const positions = new Map();
    const horizontal = direction === "left" || direction === "right";
    const positive = direction === "right" || direction === "down";
    const siblingPreset = this.map.siblingSpacing || "regular";
    const levelPreset = this.map.levelSpacing || "regular";
    const primaryGap = levelPreset === "extended" ? 300 : (levelPreset === "compact" ? 90 : 150);
    const bandGap = siblingPreset === "extended" ? 300 : (siblingPreset === "compact" ? 36 : 70);
    const staggerStep = siblingPreset === "extended" ? 95 : (siblingPreset === "compact" ? 24 : 38);
    const crossGap = siblingPreset === "extended" ? 300 : (siblingPreset === "compact" ? 70 : 110);
    positions.set(root.id, { x: -CARD_WIDTH / 2, y: -CARD_HEIGHT / 2 });
    const rootHalf = horizontal ? CARD_WIDTH / 2 : CARD_HEIGHT / 2;
    const initialCursor = rootHalf + primaryGap;
    const sideCursors = [initialCursor, initialCursor];
    let previousBandStart = initialCursor - staggerStep;
    this.visibleChildren(root).forEach((branch, index) => {
      const branchDirection = horizontal ? (index % 2 === 0 ? "up" : "down") : (index % 2 === 0 ? "left" : "right");
      const tree = this.directionalSubtreeLayout(branch, branchDirection);
      const primaryMin = horizontal ? tree.bounds.minX : tree.bounds.minY;
      const primaryMax = horizontal ? tree.bounds.maxX : tree.bounds.maxY;
      const crossMin = horizontal ? tree.bounds.minY : tree.bounds.minX;
      const crossMax = horizontal ? tree.bounds.maxY : tree.bounds.maxX;
      const primarySpan = primaryMax - primaryMin;
      const negativeSide = branchDirection === "up" || branchDirection === "left";
      const sideIndex = negativeSide ? 0 : 1;
      const bandStart = Math.max(sideCursors[sideIndex], previousBandStart + staggerStep);
      const primaryShift = positive ? bandStart - primaryMin : -bandStart - primaryMax;
      const crossShift = negativeSide ? -crossGap - crossMax : crossGap - crossMin;
      for (const [nodeId, position] of tree.positions) {
        positions.set(nodeId, horizontal
          ? { x: position.x + primaryShift, y: position.y + crossShift }
          : { x: position.x + crossShift, y: position.y + primaryShift });
      }
      sideCursors[sideIndex] = bandStart + primarySpan + bandGap;
      previousBandStart = bandStart;
    });
    return this.finalizeLayoutPositions(positions);
  }

  calculateLinearLayout(root, direction) {
    const positions = new Map();
    const siblingPreset = this.map.siblingSpacing || "regular";
    const levelPreset = this.map.levelSpacing || "regular";
    const rowGap = siblingPreset === "extended" ? 95 : (siblingPreset === "compact" ? 18 : 38);
    const indent = levelPreset === "extended" ? 438 : (levelPreset === "compact" ? 145 : 236);
    const [, sequenceDirection, branchDirection] = direction.split("-");
    const verticalSequence = sequenceDirection === "up" || sequenceDirection === "down";
    const rowStep = (verticalSequence ? CARD_HEIGHT + SCORE_FOOTER_HEIGHT : CARD_WIDTH) + rowGap;
    const firstSequence = verticalSequence ? 170 : CARD_WIDTH + rowGap;
    let rowIndex = 0;
    let maximumX = CARD_WIDTH;
    let maximumY = CARD_HEIGHT + SCORE_FOOTER_HEIGHT;

    const placeChildren = (parent, depth) => {
      for (const child of this.visibleChildren(parent)) {
        const sequence = firstSequence + rowIndex * rowStep;
        const branch = depth * indent;
        const x = verticalSequence ? branch : sequence;
        const y = verticalSequence ? sequence : branch;
        positions.set(child.id, { x, y });
        maximumX = Math.max(maximumX, x + CARD_WIDTH);
        maximumY = Math.max(maximumY, y + CARD_HEIGHT + SCORE_FOOTER_HEIGHT);
        rowIndex += 1;
        placeChildren(child, depth + 1);
      }
    };

    positions.set(root.id, { x: 0, y: 0 });
    placeChildren(root, 1);
    const goesLeft = sequenceDirection === "left" || branchDirection === "left";
    const goesUp = sequenceDirection === "up" || branchDirection === "up";
    if (goesLeft || goesUp) {
      for (const position of positions.values()) {
        if (goesLeft) position.x = maximumX - CARD_WIDTH - position.x;
        if (goesUp) position.y = maximumY - CARD_HEIGHT - SCORE_FOOTER_HEIGHT - position.y;
      }
    }
    const contentWidth = Math.max(760, maximumX + TREE_MARGIN * 2);
    const contentHeight = Math.max(520, maximumY + TREE_MARGIN * 2);
    const offsetX = CANVAS_SPACE + (contentWidth - maximumX) / 2;
    const offsetY = CANVAS_SPACE + TREE_MARGIN;
    for (const position of positions.values()) {
      position.x += offsetX;
      position.y += offsetY;
    }
    return { positions, width: contentWidth + CANVAS_SPACE * 2, height: contentHeight + CANVAS_SPACE * 2 };
  }

  staggeredBranchDirection(nodeId, trunkDirection) {
    const root = this.getNode(this.map.rootId);
    let branch = this.getNode(nodeId);
    while (branch?.parentId && branch.parentId !== root?.id) branch = this.getNode(branch.parentId);
    const index = Math.max(0, root?.childIds.indexOf(branch?.id) ?? 0);
    return trunkDirection === "left" || trunkDirection === "right"
      ? (index % 2 === 0 ? "up" : "down")
      : (index % 2 === 0 ? "left" : "right");
  }

  connectorAnchor(position, direction, outgoing, cardHeight = CARD_HEIGHT) {
    if (direction === "right") return { x: outgoing ? position.x + CARD_WIDTH : position.x, y: position.y + cardHeight / 2 };
    if (direction === "left") return { x: outgoing ? position.x : position.x + CARD_WIDTH, y: position.y + cardHeight / 2 };
    if (direction === "down") return { x: position.x + CARD_WIDTH / 2, y: outgoing ? position.y + cardHeight : position.y };
    return { x: position.x + CARD_WIDTH / 2, y: outgoing ? position.y : position.y + cardHeight };
  }

  labelNearChild(start, end, branchDirection) {
    if (branchDirection === "left" || branchDirection === "right") {
      const distance = Math.abs(end.x - start.x);
      const offset = Math.min(72, distance / 2);
      return { x: end.x + Math.sign(start.x - end.x) * offset, y: end.y - 5 };
    }
    const distance = Math.abs(end.y - start.y);
    const offset = Math.min(38, distance / 2);
    return { x: end.x, y: end.y + Math.sign(start.y - end.y) * offset - 5 };
  }

  edgeGeometry(parent, child, childId, cardHeight = CARD_HEIGHT) {
    const layout = this.map.layout || "down";
    if (layout.startsWith("linear-")) {
      const [, sequenceDirection, branchDirection] = layout.split("-");
      const verticalSequence = sequenceDirection === "up" || sequenceDirection === "down";
      let start;
      let end;
      let path;
      if (verticalSequence) {
        const goesLeft = branchDirection === "left";
        start = { x: goesLeft ? parent.x + CARD_WIDTH - 16 : parent.x + 16, y: sequenceDirection === "up" ? parent.y : parent.y + cardHeight };
        end = { x: goesLeft ? child.x + CARD_WIDTH : child.x, y: child.y + cardHeight / 2 };
        path = `M ${start.x} ${start.y} L ${start.x} ${end.y} L ${end.x} ${end.y}`;
        const label = this.labelNearChild(start, end, branchDirection);
        return { start, end, path, labelX: label.x, labelY: label.y, linear: true };
      }
      const branchUp = branchDirection === "up";
      start = { x: sequenceDirection === "left" ? parent.x : parent.x + CARD_WIDTH, y: branchUp ? parent.y + cardHeight - 16 : parent.y + 16 };
      end = { x: child.x + CARD_WIDTH / 2, y: branchUp ? child.y + cardHeight : child.y };
      path = `M ${start.x} ${start.y} L ${end.x} ${start.y} L ${end.x} ${end.y}`;
      const label = this.labelNearChild(start, end, branchDirection);
      return { start, end, path, labelX: label.x, labelY: label.y, linear: true };
    }

    let direction = layout;
    let staggeredRoot = false;
    if (layout.startsWith("staggered-")) {
      const trunkDirection = layout.slice("staggered-".length);
      direction = this.staggeredBranchDirection(childId, trunkDirection);
      staggeredRoot = this.getNode(childId)?.parentId === this.map.rootId;
      if (staggeredRoot) {
        const start = this.connectorAnchor(parent, trunkDirection, true, cardHeight);
        const end = this.connectorAnchor(child, direction, false, cardHeight);
        const path = trunkDirection === "left" || trunkDirection === "right"
          ? `M ${start.x} ${start.y} L ${end.x} ${start.y} L ${end.x} ${end.y}`
          : `M ${start.x} ${start.y} L ${start.x} ${end.y} L ${end.x} ${end.y}`;
        const label = this.labelNearChild(start, end, direction);
        return { start, end, path, labelX: label.x, labelY: label.y, linear: false };
      }
    }
    const start = this.connectorAnchor(parent, direction, true, cardHeight);
    const end = this.connectorAnchor(child, direction, false, cardHeight);
    const middleX = start.x + (end.x - start.x) / 2;
    const middleY = start.y + (end.y - start.y) / 2;
    const horizontal = direction === "left" || direction === "right";
    const path = horizontal
      ? `M ${start.x} ${start.y} C ${middleX} ${start.y}, ${middleX} ${end.y}, ${end.x} ${end.y}`
      : `M ${start.x} ${start.y} C ${start.x} ${middleY}, ${end.x} ${middleY}, ${end.x} ${end.y}`;
    return { start, end, path, labelX: middleX, labelY: middleY - 5, linear: false };
  }

  drawEdges(svg, positions) {
    for (const node of this.map.nodes) {
      if (!node.parentId) continue;
      if (!this.isVisibleInFocus(node.id) || !this.isVisibleInFocus(node.parentId)) continue;
      const parent = positions.get(node.parentId);
      const child = positions.get(node.id);
      if (!parent || !child) continue;

      const geometry = this.edgeGeometry(parent, child, node.id);
      const linearEdge = geometry.linear;
      const dimmedClass = this.shouldDimNode(node.id) ? " is-dimmed" : "";
      svg.createSvg("path", {
        attr: {
          class: `kdh-line${linearEdge ? ` is-linear is-${node.type}` : ""}${dimmedClass}`,
          "data-node-id": node.id,
          d: geometry.path,
        },
      });

      const label = node.relationship || DEFAULT_RELATIONSHIPS[node.type] || NODE_TYPES[node.type]?.label || "Related";
      const shownLabel = label.length > 26 ? `${label.slice(0, 25)}…` : label;
      const labelX = geometry.labelX;
      const labelY = geometry.labelY;
      const labelWidth = Math.max(62, Math.min(190, shownLabel.length * 6.5 + 20));
      const group = svg.createSvg("g", { attr: { class: `kdh-edge-label${dimmedClass}`, "data-node-id": node.id } });
      group.createSvg("rect", { attr: { x: String(labelX - labelWidth / 2), y: String(labelY - 13), width: String(labelWidth), height: "23", rx: "11" } });
      group.createSvg("text", { attr: { x: String(labelX), y: String(labelY + 2), "text-anchor": "middle" } }).setText(shownLabel);
      group.addEventListener("dblclick", () => this.editRelationship(node));
    }
  }

  drawNodes(canvas, positions) {
    for (const node of this.map.nodes) {
      if (!this.isVisibleInFocus(node.id)) continue;
      const position = positions.get(node.id);
      if (!position) continue;
      const typeClass = NODE_TYPES[node.type]?.color || "option";
      const selectedClass = node.id === this.map.selectedId ? " is-selected" : "";
      const dimmedClass = this.shouldDimNode(node.id) ? " is-dimmed" : "";
      const dealBreakerClass = node.type === "risk" && node.isConstraint ? " is-deal-breaker" : "";
      const lockingId = this.lockingNodeId(node.id);
      const lockedClass = lockingId ? " is-locked" : "";
      const childrenClass = node.childIds.length ? " has-children" : "";
      const card = canvas.createDiv({ cls: `kdh-node kdh-type-${typeClass}${dealBreakerClass}${selectedClass}${dimmedClass}${lockedClass}${childrenClass}` });
      card.dataset.nodeId = node.id;
      card.setAttribute("aria-selected", node.id === this.map.selectedId ? "true" : "false");
      card.draggable = Boolean(node.parentId && !lockingId);
      card.style.left = `${position.x}px`;
      card.style.top = `${position.y}px`;
      card.createDiv({ cls: "kdh-node-type", text: NODE_TYPES[node.type]?.label || node.type });
      card.createDiv({ cls: "kdh-node-text", text: node.text });
      if (lockingId) {
        const lockingNode = this.getNode(lockingId);
        const lockBadge = card.createSpan({
          cls: "kdh-lock-badge",
          attr: { "aria-label": `Branch locked by ${lockingNode?.text || "ancestor"}`, title: `Branch locked by ${lockingNode?.text || "ancestor"}` },
        });
        setIcon(lockBadge, "lock");
      }
      if ((node.type === "benefit" || node.type === "risk") && this.factorHasEvidence(node)) {
        const evidenceBadge = card.createSpan({
          cls: "kdh-evidence-badge",
          attr: { "aria-label": "Supporting evidence attached", title: "Supporting evidence attached" },
        });
        setIcon(evidenceBadge, "paperclip");
      }

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
        } else if (totals.score === null) {
          scoreBox.createDiv({ cls: "kdh-simple-score is-incomplete", text: "Not evaluated · required path missing" });
        } else if (totals.disqualified) {
          scoreBox.createDiv({ cls: "kdh-simple-score is-blocked", text: `Blocked: ${totals.disqualifyingRisk?.text || "deal-breaker risk"}` });
        } else {
          scoreBox.createDiv({ cls: `kdh-simple-score${totals.score < 0 ? " is-negative" : ""}`, text: `${this.scoreDescription(totals.score)} · ${totals.score >= 0 ? "+" : ""}${totals.score}` });
        }
      }

      if (node.childIds.length) {
        const childCount = node.childIds.length;
        const collapse = card.createEl("button", {
          cls: `kdh-collapse-toggle${node.collapsed ? " is-collapsed" : ""}`,
          attr: {
            "aria-label": `${node.collapsed ? "Expand" : "Collapse"} branch with ${childCount} connected item${childCount === 1 ? "" : "s"}`,
            "aria-expanded": String(!node.collapsed),
            title: node.collapsed ? "Expand branch" : "Collapse branch",
          },
        });
        collapse.createSpan({ cls: "kdh-collapse-badge", text: node.collapsed ? `+${childCount}` : "−" });
        collapse.addEventListener("pointerdown", (event) => event.stopPropagation());
        collapse.addEventListener("dblclick", (event) => event.stopPropagation());
        collapse.addEventListener("click", (event) => {
          event.stopPropagation();
          this.toggleBranch(node);
        });
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
      const nextZoom = Math.max(MIN_ZOOM, Math.min(2, oldZoom * (event.deltaY < 0 ? 1.1 : 0.9)));
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
      for (const point of points) {
        try { scroller.setPointerCapture(point.pointerId); } catch (_) {}
      }
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
      const startedOnContent = Boolean(event.target.closest(".kdh-node, .kdh-edge-label, .kdh-toolbar"));
      touches.set(event.pointerId, { pointerId: event.pointerId, x: event.clientX, y: event.clientY, startedOnContent });
      if (touches.size === 1) {
        touchMoved = false;
        if (!startedOnContent) {
          event.preventDefault();
          scroller.setPointerCapture(event.pointerId);
          touchPan = { x: event.clientX, y: event.clientY, left: scroller.scrollLeft, top: scroller.scrollTop };
          scroller.addClass("is-panning");
        } else {
          touchPan = null;
        }
      } else if (touches.size === 2) {
        event.preventDefault();
        beginPinch();
      }
    }, true);

    scroller.addEventListener("pointermove", (event) => {
      if (event.pointerType !== "touch" || !touches.has(event.pointerId)) return;
      event.preventDefault();
      const point = touches.get(event.pointerId);
      touches.set(event.pointerId, { ...point, x: event.clientX, y: event.clientY });
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
          this.updateSelectionStyles();
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
          this.updateSelectionStyles();
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

module.exports = class KempfSimpleDecisionHelperPlugin extends Plugin {
  async onload() {
    const storedSettings = (await this.loadData()) || {};
    const removedRetiredSetting = Object.prototype.hasOwnProperty.call(storedSettings, "defaultZoom")
      || Object.prototype.hasOwnProperty.call(storedSettings, "defaultSubOptionMode");
    this.settings = { ...DEFAULT_SETTINGS, ...storedSettings };
    delete this.settings.defaultZoom;
    delete this.settings.defaultSubOptionMode;
    this.settings.defaultBackground = normalizeBackground(this.settings.defaultBackground);
    this.settings.defaultLayout = normalizeLayout(this.settings.defaultLayout);
    if (removedRetiredSetting) await this.saveSettings();
    this.registerView(VIEW_TYPE, (leaf) => new DecisionMapView(leaf, this));
    this.registerExtensions([FILE_EXTENSION], VIEW_TYPE);
    this.addSettingTab(new DecisionHelperSettingTab(this.app, this));
    this.addRibbonIcon("git-branch", "Create The Kempf Simple Decision Helper", () => this.createNewDecision());
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
    new CreateDecisionModal(this.app, this.settings, async (text, templateId) => {
        const map = createDecisionMapFromTemplate(this.settings, text, templateId);
        const file = await this.app.vault.create(this.availablePath(text), JSON.stringify(map, null, 2));
        const leaf = this.app.workspace.getLeaf("tab");
        await leaf.openFile(file);
        this.app.workspace.revealLeaf(leaf);
    }).open();
  }
};
