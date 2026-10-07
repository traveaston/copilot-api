import { describe, expect, test } from "bun:test"
import { Glob } from "bun"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// Every exception comes first so a reviewer sees it before the guards: the
// pair table, UNCHECKED, DYNAMIC_TOKEN_PREFIXES, then the overrides.

type Theme = "light" | "dark"

/**
 * One row per distinct foreground on a stack (spec §7.3, §11.3). A stack is
 * top-first and ends on `canvas`; `›` separates its layers. The minimum is 4.5
 * for text and 3 for non-text.
 */
const PAIRS: ReadonlyArray<
  readonly [use: string, fg: string, stack: string, min: number]
> = [
  ["page title, section headings", "ink-strong", "canvas", 4.5],
  ["subtitle, hints, section subtitles", "ink-soft", "canvas", 4.5],
  ["header field labels", "ink-label", "canvas", 4.5],
  ["error alert on the page", "danger", "danger-soft › canvas", 4.5],
  [
    "Refreshing summary/details chips",
    "accent-strong",
    "accent-soft › canvas",
    4.5,
  ],
  [
    "header input and select text, theme toggle hover text",
    "ink-strong",
    "surface-soft › canvas",
    4.5,
  ],
  ["header input placeholder", "ink-faint", "surface-soft › canvas", 4.5],
  ["inactive tab text", "ink-soft", "surface-soft › canvas", 4.5],
  ["theme toggle text and icon", "ink-label", "surface-soft › canvas", 4.5],
  ["header input and select border", "line-strong", "canvas", 3],
  ["theme toggle focus outline", "accent", "canvas", 3],
  [
    "selected tab fill vs tablist; tab focus outline; header input focus border vs its inside; spinner arc vs disc",
    "accent",
    "surface-soft › canvas",
    3,
  ],
  ["header input focus border vs halo", "accent", "focus-ring › canvas", 3],
  ["active tab text", "on-accent", "accent › surface-soft › canvas", 4.5],
  ["Refresh text", "on-accent", "accent › canvas", 4.5],
  ["Refresh hover text", "on-accent", "accent-strong › canvas", 4.5],
  [
    "panel title, JSON keys, model names, selected panel tab text",
    "ink-strong",
    "surface › canvas",
    4.5,
  ],
  ["body text", "ink", "surface › canvas", 4.5],
  ["labels on panel", "ink-label", "surface › canvas", 4.5],
  ["table cells, ids", "ink-cell", "surface › canvas", 4.5],
  [
    "meta, legend, JSON empties, panel tab text and counts, Loading sessions, the Sessions empty state and meta line",
    "ink-soft",
    "surface › canvas",
    4.5,
  ],
  [
    "links, section icons, JSON scalars, models-action text and its focus outline, selected panel tab bottom border, panel tab focus outline",
    "accent",
    "surface › canvas",
    4.5,
  ],
  ["models-action hover text", "accent-strong", "surface › canvas", 4.5],
  [
    "Total Tokens and Total Cost cells",
    "ink-highlight",
    "surface › canvas",
    4.5,
  ],
  ["JSON true", "success", "surface › canvas", 4.5],
  ["JSON false", "danger", "surface › canvas", 4.5],
  [
    "error alert inside a panel, Sessions list error",
    "danger",
    "danger-soft › surface › canvas",
    4.5,
  ],
  ["chart axis labels", "chart-label", "surface › canvas", 4.5],
  [
    "models search and Filters select text",
    "ink-strong",
    "surface-soft › surface › canvas",
    4.5,
  ],
  [
    "models search placeholder",
    "ink-faint",
    "surface-soft › surface › canvas",
    4.5,
  ],
  [
    "models search and Filters select border",
    "line-strong",
    "surface › canvas",
    3,
  ],
  [
    "panel input focus border vs its inside; spinner arc vs disc in a panel",
    "accent",
    "surface-soft › surface › canvas",
    3,
  ],
  [
    "panel input focus border vs halo",
    "accent",
    "focus-ring › surface › canvas",
    3,
  ],
  ["trend chart line", "series-total", "surface › canvas", 3],
  ["trend chart line", "series-input", "surface › canvas", 3],
  ["trend chart line", "series-output", "surface › canvas", 3],
  ["trend chart line", "series-cache-read", "surface › canvas", 3],
  ["trend chart line", "series-cache-write", "surface › canvas", 3],
  [
    "table head text, model JSON text",
    "ink-label",
    "sunken › surface › canvas",
    4.5,
  ],
  ["models table head text", "ink-soft", "sunken › surface › canvas", 4.5],
  ["code-block scrollbar thumb", "line-strong", "sunken › surface › canvas", 3],
  [
    "code-block scrollbar thumb hover",
    "ink-faint",
    "sunken › surface › canvas",
    3,
  ],
  ["readout strip date", "ink-strong", "sunken-strong › surface › canvas", 4.5],
  ["readout strip values", "ink-cell", "sunken-strong › surface › canvas", 4.5],
  [
    "inactive trend pill text, Previous and Next pagers",
    "ink-label",
    "surface-solid › surface › canvas",
    4.5,
  ],
  ["active trend pill text", "accent", "accent-soft › surface › canvas", 4.5],
  [
    "inactive trend pill dot",
    "series-total",
    "surface-solid › surface › canvas",
    3,
  ],
  [
    "inactive trend pill dot",
    "series-input",
    "surface-solid › surface › canvas",
    3,
  ],
  [
    "inactive trend pill dot",
    "series-output",
    "surface-solid › surface › canvas",
    3,
  ],
  [
    "inactive trend pill dot",
    "series-cache-read",
    "surface-solid › surface › canvas",
    3,
  ],
  [
    "inactive trend pill dot",
    "series-cache-write",
    "surface-solid › surface › canvas",
    3,
  ],
  [
    "active trend pill dot",
    "series-total",
    "accent-soft › surface › canvas",
    3,
  ],
  [
    "active trend pill dot",
    "series-input",
    "accent-soft › surface › canvas",
    3,
  ],
  [
    "active trend pill dot",
    "series-output",
    "accent-soft › surface › canvas",
    3,
  ],
  [
    "active trend pill dot",
    "series-cache-read",
    "accent-soft › surface › canvas",
    3,
  ],
  [
    "active trend pill dot",
    "series-cache-write",
    "accent-soft › surface › canvas",
    3,
  ],
  ["metric value", "ink-strong", "surface-strong › canvas", 4.5],
  ["metric label", "ink-label", "surface-strong › canvas", 4.5],
  ["metric note", "ink-soft", "surface-strong › canvas", 4.5],
  ["Unlimited chip", "accent", "accent-soft › surface-strong › canvas", 4.5],
  ["metric card dot", "series-total", "surface-strong › canvas", 3],
  ["metric card dot", "series-input", "surface-strong › canvas", 3],
  ["metric card dot", "series-output", "surface-strong › canvas", 3],
  [
    "metric card dot, Cache Hit Rate card dot",
    "series-cache-read",
    "surface-strong › canvas",
    3,
  ],
  ["metric card dot", "series-cache-write", "surface-strong › canvas", 3],
  ["metric card dot", "series-request-events", "surface-strong › canvas", 3],
  ["metric card dot", "series-cost", "surface-strong › canvas", 3],
  ["quota dot", "success", "surface-strong › canvas", 3],
  ["quota dot", "warning", "surface-strong › canvas", 3],
  ["quota dot", "danger", "surface-strong › canvas", 3],
  ["quota dot (Unlimited)", "accent", "surface-strong › canvas", 3],
  [
    "quota bar vs track",
    "success",
    "sunken-strong › surface-strong › canvas",
    3,
  ],
  [
    "quota bar vs track",
    "warning",
    "sunken-strong › surface-strong › canvas",
    3,
  ],
  [
    "quota bar vs track",
    "danger",
    "sunken-strong › surface-strong › canvas",
    3,
  ],
  [
    "Unlimited bar vs track",
    "accent",
    "sunken-strong › surface-strong › canvas",
    3,
  ],
  // Sessions (spec §11.3)
  [
    "clock, token total, legend counts, full key, Total cells, long gaps",
    "ink-strong",
    "surface-solid › sunken › surface › canvas",
    4.5,
  ],
  ["age", "ink-label", "surface-solid › sunken › surface › canvas", 4.5],
  [
    "legend names, table cells",
    "ink-cell",
    "surface-solid › sunken › surface › canvas",
    4.5,
  ],
  [
    "day and duration, active range, unit words, chevron, head line, gaps, trace ids, day dividers, footer, share percent",
    "ink-soft",
    "surface-solid › sunken › surface › canvas",
    4.5,
  ],
  ["short key", "ink-faint", "surface-solid › sunken › surface › canvas", 4.5],
  ["costs", "ink-highlight", "surface-solid › sunken › surface › canvas", 4.5],
  [
    "request count",
    "series-request-events",
    "surface-solid › sunken › surface › canvas",
    4.5,
  ],
  [
    "link buttons, trace hover, card-header focus outline, span ends vs card",
    "accent",
    "surface-solid › sunken › surface › canvas",
    4.5,
  ],
  ["footer error", "danger", "surface-solid › sunken › surface › canvas", 4.5],
  [
    "span vs its track",
    "accent",
    "line › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "table head text; hovered or pressed breakdown row: active range, share percent",
    "ink-soft",
    "sunken › surface-solid › sunken › surface › canvas",
    4.5,
  ],
  [
    "hovered or pressed breakdown row: cells, model name",
    "ink-cell",
    "sunken › surface-solid › sunken › surface › canvas",
    4.5,
  ],
  [
    "hovered or pressed breakdown row: Total, request count",
    "ink-strong",
    "sunken › surface-solid › sunken › surface › canvas",
    4.5,
  ],
  [
    "hovered or pressed breakdown row: cost",
    "ink-highlight",
    "sunken › surface-solid › sunken › surface › canvas",
    4.5,
  ],
  [
    "pressed breakdown row: inset bar",
    "accent",
    "sunken › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "token bar, token legend dot, share-cell bar, segment gap",
    "series-input",
    "surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "token bar, token legend dot, share-cell bar, segment gap",
    "series-output",
    "surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "token bar, token legend dot, share-cell bar, segment gap",
    "series-cache-read",
    "surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "token bar, token legend dot, share-cell bar, segment gap",
    "series-cache-write",
    "surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "share-cell bar vs its track",
    "series-input",
    "line › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "share-cell bar vs its track",
    "series-output",
    "line › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "share-cell bar vs its track",
    "series-cache-read",
    "line › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "share-cell bar vs its track",
    "series-cache-write",
    "line › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "share-cell bar, hovered or pressed row",
    "series-input",
    "sunken › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "share-cell bar, hovered or pressed row",
    "series-output",
    "sunken › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "share-cell bar, hovered or pressed row",
    "series-cache-read",
    "sunken › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "share-cell bar, hovered or pressed row",
    "series-cache-write",
    "sunken › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "share-cell bar vs its track, hovered or pressed row",
    "series-input",
    "line › sunken › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "share-cell bar vs its track, hovered or pressed row",
    "series-output",
    "line › sunken › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "share-cell bar vs its track, hovered or pressed row",
    "series-cache-read",
    "line › sunken › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "share-cell bar vs its track, hovered or pressed row",
    "series-cache-write",
    "line › sunken › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "model share bar, model legend dot, breakdown dot, event-row dot, segment gap",
    "creator-anthropic",
    "surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "model share bar, model legend dot, breakdown dot, event-row dot, segment gap",
    "creator-openai",
    "surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "model share bar, model legend dot, breakdown dot, event-row dot, segment gap",
    "creator-kimi",
    "surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "model share bar, model legend dot, breakdown dot, event-row dot, segment gap",
    "creator-xai",
    "surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "model share bar, model legend dot, breakdown dot, event-row dot, segment gap",
    "creator-google",
    "surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "model share bar, model legend dot, breakdown dot, event-row dot, segment gap",
    "creator-microsoft-ai",
    "surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "model share bar, model legend dot, breakdown dot, event-row dot, segment gap",
    "creator-other",
    "surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "breakdown dot, hovered or pressed row",
    "creator-anthropic",
    "sunken › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "breakdown dot, hovered or pressed row",
    "creator-openai",
    "sunken › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "breakdown dot, hovered or pressed row",
    "creator-kimi",
    "sunken › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "breakdown dot, hovered or pressed row",
    "creator-xai",
    "sunken › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "breakdown dot, hovered or pressed row",
    "creator-google",
    "sunken › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "breakdown dot, hovered or pressed row",
    "creator-microsoft-ai",
    "sunken › surface-solid › sunken › surface › canvas",
    3,
  ],
  [
    "breakdown dot, hovered or pressed row",
    "creator-other",
    "sunken › surface-solid › sunken › surface › canvas",
    3,
  ],
]

/** Tokens no row covers, each with its reason (spec §7.4, §11.1). */
const UNCHECKED: Readonly<Record<string, string>> = {
  line: "Hairlines (panel, card, table, tablist, Sessions card and table borders, the dashed divider, the Sessions track and bar backgrounds, the table's sunken row borders), plus the pill, pagination and theme-toggle borders. Those controls are identified by their text labels, and the span track's position is also given as text in the active range, so 1.4.11 sets no boundary requirement.",
  "accent-line":
    "The active trend pill's border, and the expanded Sessions card's border. The pill is labelled, and its text and fill change too.",
  "danger-line":
    "The error alert's border. The alert carries text and an icon.",
  shadow: "Decorative elevation.",
  "chart-grid":
    "Gridlines. They aren't needed to read the chart (1.4.11 Understanding, Figure 20).",
  "chart-marker":
    "The dashed active-day line. The active day is also shown as text in the readout strip.",
}

/** Token-name prefixes a reference may continue into `${…}` from. */
const DYNAMIC_TOKEN_PREFIXES: ReadonlyArray<string> = ["creator-"]

const BRAND = {
  reason:
    "brand styling, provisional pending Trav's review of the combined build",
  decided: "Trav, 2026-10-02",
}

interface Override {
  /** The row it applies to, by foreground and stack. */
  fg: string
  stack: string
  theme: Theme
  /** The ratio accepted as a floor. */
  floor: number
  reason: string
  decided: string
}

/** Accepted pairs below their minimum, for the failing theme only (spec §11.4). */
const OVERRIDES: ReadonlyArray<Override> = [
  {
    fg: "creator-anthropic",
    stack: "surface-solid › sunken › surface › canvas",
    theme: "dark",
    floor: 2.67,
    ...BRAND,
  },
  {
    fg: "creator-anthropic",
    stack: "sunken › surface-solid › sunken › surface › canvas",
    theme: "dark",
    floor: 2.8,
    ...BRAND,
  },
  {
    fg: "creator-microsoft-ai",
    stack: "sunken › surface-solid › sunken › surface › canvas",
    theme: "light",
    floor: 2.88,
    ...BRAND,
  },
]

/** Painted but not checked, by design (spec §7.5, §11.1). */
export const NOT_CHECKED: ReadonlyArray<string> = [
  "Decorative icons that sit beside text: section headings, tabs, copy, alert and info icons.",
  "The Refresh button's fill against the page. The button is labelled.",
  "UA-painted parts the author doesn't style: the native select arrow, the search-cancel glyph, and the default focus ring on .primary-action, .pill-button, the selects, .session-breakdown-button, .session-link-button and .session-trace.",
  "Disabled buttons and selects (opacity .55). Inactive components are exempt.",
  "The opacity-60 loading wrappers.",
  "The Sessions reload dim (the list at opacity .6, and the survivor reload's cells at .6).",
  "The filtered-out breakdown rows, with content at opacity .45.",
  "The cost digits past the second decimal, at opacity .55.",
  "The model share bar fills its track, so a creator fill doesn't meet the line background (decided by Trav, 2026-10-07).",
]

/** Colour keywords that aren't colours for the no-literal guard. */
const EXEMPT_KEYWORDS: ReadonlyArray<string> = [
  "transparent",
  "none",
  "currentcolor",
]

/** The one token block, in order. */
const EXPECTED_TOKENS: ReadonlyArray<string> = [
  "canvas",
  "canvas-top",
  "surface-soft",
  "surface",
  "surface-strong",
  "surface-solid",
  "sunken",
  "sunken-strong",
  "line",
  "line-strong",
  "shadow",
  "ink-strong",
  "ink",
  "ink-label",
  "ink-cell",
  "ink-soft",
  "ink-faint",
  "ink-highlight",
  "on-accent",
  "accent",
  "accent-strong",
  "accent-soft",
  "accent-line",
  "focus-ring",
  "success",
  "warning",
  "danger",
  "danger-soft",
  "danger-line",
  "series-total",
  "series-input",
  "series-output",
  "series-cache-read",
  "series-cache-write",
  "series-request-events",
  "series-cost",
  "chart-grid",
  "chart-label",
  "chart-marker",
  "creator-anthropic",
  "creator-openai",
  "creator-kimi",
  "creator-xai",
  "creator-google",
  "creator-microsoft-ai",
  "creator-other",
]

// CSS Color 4 named colours.
const NAMED_COLORS = (
  "aliceblue antiquewhite aqua aquamarine azure beige bisque black "
  + "blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse "
  + "chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan "
  + "darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta "
  + "darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen "
  + "darkslateblue darkslategray darkslategrey darkturquoise darkviolet "
  + "deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite "
  + "forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green "
  + "greenyellow grey honeydew hotpink indianred indigo ivory khaki lavender "
  + "lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan "
  + "lightgoldenrodyellow lightgray lightgreen lightgrey lightpink "
  + "lightsalmon lightseagreen lightskyblue lightslategray lightslategrey "
  + "lightsteelblue lightyellow lime limegreen linen magenta maroon "
  + "mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen "
  + "mediumslateblue mediumspringgreen mediumturquoise mediumvioletred "
  + "midnightblue mintcream mistyrose moccasin navajowhite navy oldlace "
  + "olive olivedrab orange orangered orchid palegoldenrod palegreen "
  + "paleturquoise palevioletred papayawhip peachpuff peru pink plum "
  + "powderblue purple rebeccapurple red rosybrown royalblue saddlebrown "
  + "salmon sandybrown seagreen seashell sienna silver skyblue slateblue "
  + "slategray slategrey snow springgreen steelblue tan teal thistle tomato "
  + "turquoise violet wheat white whitesmoke yellow yellowgreen"
).split(" ")

const COLOR_FUNCTIONS = [
  "rgb",
  "rgba",
  "hsl",
  "hsla",
  "hwb",
  "lab",
  "lch",
  "oklab",
  "oklch",
  "color",
  "color-mix",
]

const TAILWIND_PALETTE = [
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "black",
  "white",
]

const TAILWIND_COLOR_PREFIXES = [
  "bg",
  "text",
  "border",
  "border-[trblxyse]",
  "ring",
  "outline",
  "divide",
  "fill",
  "stroke",
  "from",
  "via",
  "to",
  "placeholder",
  "caret",
  "accent",
  "decoration",
  "shadow",
]

// --- Scanning helpers ---

interface Source {
  name: string
  text: string
}

const TOKEN_BLOCK = /:root\s*\{[^}]*\}/g

const stripTokenBlock = (text: string) => text.replaceAll(TOKEN_BLOCK, "")

const lineOf = (text: string, index: number) =>
  text.slice(0, index).split("\n").length

const loadSources = (): Array<Source> => {
  const root = join(import.meta.dir, "..", "pages")
  const names = [
    "index.html",
    ...Array.from(new Glob("**/*.js").scanSync({ cwd: root })).sort(),
  ]
  return names.map((name) => ({
    name: `pages/${name}`,
    text: readFileSync(join(root, name), "utf8"),
  }))
}

const escapeRegExp = (text: string) =>
  text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`)

const wordGuard = (names: ReadonlyArray<string>) =>
  new RegExp(
    `(?<![\\w-])(?:${names.map(escapeRegExp).join("|")})(?![\\w-])`,
    "gi",
  )

/** `style="…"` attribute values, allowing `${…}` holes that contain quotes. */
const styleValues = (text: string) =>
  Array.from(
    text.matchAll(
      /\bstyle=(?:"((?:\$\{[^}]*\}|[^"$]|\$(?!\{))*)"|'((?:\$\{[^}]*\}|[^'$]|\$(?!\{))*)')/g,
    ),
    (match) => ({
      value: match[1] ?? match[2] ?? "",
      index: match.index,
    }),
  )

/** `class="…"` attribute values, allowing `${…}` holes that contain quotes. */
const classValues = (text: string) =>
  Array.from(
    text.matchAll(
      /\bclass=(?:"((?:\$\{[^}]*\}|[^"$]|\$(?!\{))*)"|'((?:\$\{[^}]*\}|[^'$]|\$(?!\{))*)')/g,
    ),
    (match) => ({
      value: match[1] ?? match[2] ?? "",
      index: match.index,
    }),
  )

/** Declaration values inside `<style>` blocks. */
const styleBlockValues = (text: string) =>
  Array.from(text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)).flatMap(
    (block) =>
      Array.from(
        (block[1] ?? "").matchAll(/(?<![\w-])[a-z-]+\s*:\s*([^;{}]+)(?=[;}])/g),
        (match) => ({
          value: match[1] ?? "",
          index: (block.index ?? 0) + (match.index ?? 0),
        }),
      ),
  )

/** Values of the SVG colour attributes. */
const svgColorValues = (text: string) =>
  Array.from(
    text.matchAll(
      /(?<![\w-])(?:fill|stroke|stop-color|flood-color|lighting-color|color)=(?:"([^"]*)"|'([^']*)')/g,
    ),
    (match) => ({
      value: match[1] ?? match[2] ?? "",
      index: match.index,
    }),
  )

const valuePositions = (text: string) => [
  ...styleBlockValues(text),
  ...styleValues(text).flatMap(({ value, index }) =>
    // Only what follows a `:` is a value; this skips property names.
    value
      .split(";")
      .map((declaration) => declaration.slice(declaration.indexOf(":") + 1))
      .map((declaration) => ({ value: declaration, index })),
  ),
  ...svgColorValues(text),
]

// --- Guards ---

const HEX = /(?<!&)#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3,4})\b/g
const FUNCTION = new RegExp(
  `(?<![\\w-])(?:${COLOR_FUNCTIONS.map(escapeRegExp).join("|")})\\(`,
  "g",
)

export const findColorLiterals = (sources: ReadonlyArray<Source>) =>
  sources.flatMap(({ name, text }) => {
    const outside = stripTokenBlock(text)
    const found: Array<string> = []
    for (const match of outside.matchAll(HEX)) {
      found.push(`${name}:${lineOf(outside, match.index)} ${match[0]}`)
    }
    for (const match of outside.matchAll(FUNCTION)) {
      found.push(`${name}:${lineOf(outside, match.index)} ${match[0]}`)
    }
    const named = wordGuard(NAMED_COLORS)
    for (const { value, index } of valuePositions(outside)) {
      for (const match of value.matchAll(named)) {
        if (EXEMPT_KEYWORDS.includes(match[0].toLowerCase())) continue
        found.push(`${name}:${lineOf(outside, index)} ${match[0]}`)
      }
    }
    return found
  })

interface TokenReferences {
  /** Static `--color-<name>` references, with their location. */
  statics: Array<{ name: string; where: string }>
  /** Dynamic references (`--color-<prefix>${…}`), with their prefix. */
  prefixes: Array<{ prefix: string; where: string }>
}

export const collectReferences = (
  sources: ReadonlyArray<Source>,
): TokenReferences => {
  const references: TokenReferences = { statics: [], prefixes: [] }
  for (const { name, text } of sources) {
    const outside = stripTokenBlock(text)
    for (const match of outside.matchAll(/--color-([a-z0-9-]+)(\$\{)?/g)) {
      const where = `${name}:${lineOf(outside, match.index)}`
      const reference = match[1] ?? ""
      if (match[2] || reference.endsWith("-")) {
        references.prefixes.push({ prefix: reference, where })
      } else {
        references.statics.push({ name: reference, where })
      }
    }
  }
  return references
}

export const definedTokens = (text: string) => {
  const block = text.match(TOKEN_BLOCK)?.[0] ?? ""
  return Array.from(block.matchAll(/--color-([a-z0-9-]+)\s*:/g), (m) => m[1])
}

export const findTailwindColorClasses = (sources: ReadonlyArray<Source>) => {
  const colorUtility = new RegExp(
    `^-?(?:${TAILWIND_COLOR_PREFIXES.join("|")})-(?:(?:${TAILWIND_PALETTE.join("|")})(?:-\\d+)?(?:/\\d+)?|\\[.*\\])$`,
  )
  return sources.flatMap(({ name, text }) =>
    classValues(text).flatMap(({ value, index }) =>
      value
        .split(/\s+/)
        // Drop variants (`hover:`), keeping colons inside `[…]`.
        .map((utility) => utility.replace(/^(?:[a-z0-9-]+:)+/, ""))
        .filter((utility) => colorUtility.test(utility))
        .map((utility) => `${name}:${lineOf(text, index)} ${utility}`),
    ),
  )
}

// --- Tests ---

const sources = loadSources()
const page = sources.find((source) => source.name === "pages/index.html")

describe("usage viewer colours: token block", () => {
  test("is a single :root block", () => {
    expect(page?.text.match(TOKEN_BLOCK)).toHaveLength(1)
  })

  test("defines exactly the role tokens, in order", () => {
    expect(definedTokens(page?.text ?? "")).toEqual([...EXPECTED_TOKENS])
  })

  test("sets color-scheme to light dark, with no @supports or @property", () => {
    const block = page?.text.match(TOKEN_BLOCK)?.[0] ?? ""
    expect(block).toMatch(/color-scheme:\s*light dark;/)
    expect(page?.text).not.toContain("@supports")
    expect(page?.text).not.toContain("@property")
  })
})

describe("usage viewer colours: no colour literal", () => {
  test("pages hold no colour literal outside the token block", () => {
    expect(findColorLiterals(sources)).toEqual([])
  })

  test("catches hex, functions and named colours", () => {
    const fixture = (text: string) => [{ name: "fixture", text }]
    expect(
      findColorLiterals(fixture("<style>a { color: #fff; }</style>")),
    ).toHaveLength(1)
    expect(findColorLiterals(fixture("<p>#12345678</p>"))).toHaveLength(1)
    expect(findColorLiterals(fixture("// rgba(0, 0, 0, 0.5)"))).toHaveLength(1)
    expect(
      findColorLiterals(
        fixture("color-mix(in srgb, var(--color-accent) 8%, transparent)"),
      ),
    ).toHaveLength(1)
    expect(
      findColorLiterals(fixture("<style>a { color: red; }</style>")),
    ).toHaveLength(1)
    expect(
      findColorLiterals(fixture('<i style="color: red;"></i>')),
    ).toHaveLength(1)
    expect(findColorLiterals(fixture('<line stroke="blue" />'))).toHaveLength(1)
  })

  test("passes entities, copy, tokens and exempt keywords", () => {
    const fixture = (text: string) => [{ name: "fixture", text }]
    expect(findColorLiterals(fixture("<p>&#123; the red team</p>"))).toEqual([])
    expect(
      findColorLiterals(
        fixture("<style>a { color: var(--color-blue); }</style>"),
      ),
    ).toEqual([])
    expect(
      findColorLiterals(
        fixture('<rect fill="transparent" /><path fill="none" />'),
      ),
    ).toEqual([])
    expect(
      findColorLiterals(
        fixture("<style>a { border-color: currentColor; }</style>"),
      ),
    ).toEqual([])
  })
})

describe("usage viewer colours: token references", () => {
  const references = collectReferences(sources)
  const defined = definedTokens(page?.text ?? "")

  test("every static reference names a defined token", () => {
    const undefinedReferences = references.statics
      .filter(({ name }) => !defined.includes(name))
      .map(({ name, where }) => `${where} --color-${name}`)
    expect(undefinedReferences).toEqual([])
  })

  test("no defined token is left unreferenced", () => {
    const referenced = new Set(references.statics.map(({ name }) => name))
    const unreferenced = defined.filter(
      (name) =>
        !referenced.has(name)
        && !DYNAMIC_TOKEN_PREFIXES.some((prefix) => name.startsWith(prefix)),
    )
    expect(unreferenced).toEqual([])
  })

  test("every dynamic reference starts with a declared prefix", () => {
    const undeclared = references.prefixes
      .filter(({ prefix }) => !DYNAMIC_TOKEN_PREFIXES.includes(prefix))
      .map(({ prefix, where }) => `${where} --color-${prefix}`)
    expect(undeclared).toEqual([])
  })

  test("DYNAMIC_TOKEN_PREFIXES exists and is the creator prefix", () => {
    expect(DYNAMIC_TOKEN_PREFIXES).toEqual(["creator-"])
  })
})

describe("usage viewer colours: no Tailwind colour class", () => {
  test("class values hold no colour utility", () => {
    expect(findTailwindColorClasses(sources)).toEqual([])
  })

  test("catches palette and arbitrary colour utilities", () => {
    const fixture = (text: string) => [{ name: "fixture", text }]
    expect(
      findTailwindColorClasses(fixture('<p class="px-2 text-slate-500"></p>')),
    ).toHaveLength(1)
    expect(
      findTailwindColorClasses(fixture('<p class="hover:bg-white"></p>')),
    ).toHaveLength(1)
    expect(
      findTailwindColorClasses(fixture('<p class="border-t-red-400/50"></p>')),
    ).toHaveLength(1)
    expect(
      findTailwindColorClasses(fixture('<p class="text-[#fff]"></p>')),
    ).toHaveLength(1)
  })

  test("passes keywords and non-colour utilities", () => {
    const fixture = (text: string) => [{ name: "fixture", text }]
    expect(
      findTailwindColorClasses(
        fixture(
          '<p class="border-transparent border-4 border-t-4 text-sm shadow-sm"></p>',
        ),
      ),
    ).toEqual([])
  })
})

// --- Contrast ---

interface Rgba {
  r: number
  g: number
  b: number
  a: number
}

const toLinear = (channel: number) => {
  const c = channel / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

const luminance = ({ r, g, b }: Rgba) =>
  0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b)

const over = (top: Rgba, below: Rgba): Rgba => ({
  r: top.r * top.a + below.r * (1 - top.a),
  g: top.g * top.a + below.g * (1 - top.a),
  b: top.b * top.a + below.b * (1 - top.a),
  a: 1,
})

// stack is top-first and ends on an opaque token
const flatten = (stack: Array<Rgba>) =>
  stack.reduceRight((below, top) => over(top, below), {
    r: 255,
    g: 255,
    b: 255,
    a: 1,
  })

export const contrast = (fg: Rgba, stack: Array<Rgba>) => {
  const bg = flatten(stack)
  const [high, low] = [luminance(over(fg, bg)), luminance(bg)].sort(
    (x, y) => y - x,
  )
  return (high + 0.05) / (low + 0.05)
}

/** A hex colour or `rgb()`/`rgba()`; anything else throws. */
export const parseColor = (value: string): Rgba => {
  const text = value.trim()
  const hex = text.match(/^#([0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/)
  if (hex?.[1]) {
    const digits =
      hex[1].length <= 4 ?
        Array.from(hex[1], (digit) => digit + digit).join("")
      : hex[1]
    const channel = (index: number) =>
      Number.parseInt(digits.slice(index * 2, index * 2 + 2), 16)
    return {
      r: channel(0),
      g: channel(1),
      b: channel(2),
      a: digits.length === 8 ? channel(3) / 255 : 1,
    }
  }
  const fn = text.match(
    /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)$/,
  )
  if (fn) {
    return {
      r: Number(fn[1]),
      g: Number(fn[2]),
      b: Number(fn[3]),
      a: fn[4] === undefined ? 1 : Number(fn[4]),
    }
  }
  throw new Error(`not a hex or rgb() colour: ${value}`)
}

/** Split `a, b` at the one top-level comma, so `rgba(…, …)` stays whole. */
const splitTopLevel = (args: string) => {
  const parts: Array<string> = []
  let depth = 0
  let start = 0
  for (const [index, char] of Array.from(args).entries()) {
    if (char === "(") depth++
    else if (char === ")") depth--
    else if (char === "," && depth === 0) {
      parts.push(args.slice(start, index))
      start = index + 1
    }
  }
  parts.push(args.slice(start))
  return parts
}

/** Strict parse of the one block: every `--color-*` is `light-dark(a, b)`. */
export const parseTokens = (text: string): Map<string, Record<Theme, Rgba>> => {
  const block = text.match(TOKEN_BLOCK)?.[0] ?? ""
  const tokens = new Map<string, Record<Theme, Rgba>>()
  for (const match of block.matchAll(/--color-([a-z0-9-]+)\s*:([^;]*);/g)) {
    const name = match[1] ?? ""
    const wrapped = (match[2] ?? "").trim().match(/^light-dark\((.*)\)$/s)
    if (!wrapped) throw new Error(`--color-${name} is not light-dark(…)`)
    const parts = splitTopLevel(wrapped[1] ?? "")
    if (parts.length !== 2) {
      throw new Error(
        `--color-${name} needs exactly two light-dark() arguments`,
      )
    }
    tokens.set(name, {
      light: parseColor(parts[0] ?? ""),
      dark: parseColor(parts[1] ?? ""),
    })
  }
  return tokens
}

const rowKey = (fg: string, stack: string) => `${fg} on ${stack}`

const resolveStack = (
  tokens: Map<string, Record<Theme, Rgba>>,
  names: ReadonlyArray<string>,
  theme: Theme,
) =>
  names.map((name) => {
    const token = tokens.get(name)
    if (!token) throw new Error(`no --color-${name} token`)
    return token[theme]
  })

/** The ratio at every gradient end the stack touches, lowest first. */
export const ratiosFor = (
  tokens: Map<string, Record<Theme, Rgba>>,
  fg: string,
  stack: string,
  theme: Theme,
) => {
  const layers = stack.split(" › ")
  const ends =
    layers.at(-1) === "canvas" ?
      [layers, [...layers.slice(0, -1), "canvas-top"]]
    : [layers]
  return ends
    .map((end) =>
      contrast(
        resolveStack(tokens, [fg], theme)[0],
        resolveStack(tokens, end, theme),
      ),
    )
    .sort((x, y) => x - y)
}

describe("usage viewer colours: parser and helper", () => {
  test("black on white is 21", () => {
    expect(
      contrast(parseColor("#000000"), [parseColor("#ffffff")]),
    ).toBeCloseTo(21, 5)
  })

  test("#777 on white is 4.478 and fails 4.5", () => {
    const ratio = contrast(parseColor("#777"), [parseColor("#fff")])
    expect(ratio).toBeCloseTo(4.478, 3)
    expect(ratio).toBeLessThan(4.5)
  })

  test("#767676 on white is 4.542", () => {
    expect(
      contrast(parseColor("#767676"), [parseColor("#ffffff")]),
    ).toBeCloseTo(4.542, 3)
  })

  test("rgba(0, 0, 0, 0.5) over white flattens to 127.5 per channel", () => {
    const flat = flatten([parseColor("rgba(0, 0, 0, 0.5)")])
    expect([flat.r, flat.g, flat.b]).toEqual([127.5, 127.5, 127.5])
  })

  test("the parser rejects a var() alias and a named colour", () => {
    const parse = (value: string) =>
      parseTokens(`:root { --color-x: ${value}; }`)
    expect(() => parse("var(--color-y)")).toThrow()
    expect(() => parse("light-dark(var(--color-y), #000)")).toThrow()
    expect(() => parse("light-dark(red, #000)")).toThrow()
    expect(() => parse("light-dark(#fff, rebeccapurple)")).toThrow()
    expect(() => parse("#fff")).toThrow()
    expect(() => parse("light-dark(#fff)")).toThrow()
  })

  test("the parser splits at the top-level comma", () => {
    const tokens = parseTokens(
      ":root { --color-x: light-dark(rgba(255, 255, 255, 0.5), #000); }",
    )
    expect(tokens.get("x")?.light).toEqual({ r: 255, g: 255, b: 255, a: 0.5 })
    expect(tokens.get("x")?.dark).toEqual({ r: 0, g: 0, b: 0, a: 1 })
  })

  test("every token in the page parses", () => {
    expect(() => parseTokens(page?.text ?? "")).not.toThrow()
  })
})

describe("usage viewer colours: contrast", () => {
  const tokens = parseTokens(page?.text ?? "")
  const themes: Array<Theme> = ["light", "dark"]
  const overrideFor = (fg: string, stack: string, theme: Theme) =>
    OVERRIDES.find(
      (override) =>
        override.fg === fg
        && override.stack === stack
        && override.theme === theme,
    )

  test("pair rows are unique by foreground and stack", () => {
    const keys = PAIRS.map(([, fg, stack]) => rowKey(fg, stack))
    expect(keys.filter((key, index) => keys.indexOf(key) !== index)).toEqual([])
  })

  for (const [use, fg, stack, min] of PAIRS) {
    for (const theme of themes) {
      test(`${theme}: ${use}: ${rowKey(fg, stack)} >= ${min}`, () => {
        const [lowest = 0] = ratiosFor(tokens, fg, stack, theme)
        const override = overrideFor(fg, stack, theme)
        if (override) {
          expect(lowest).toBeLessThan(min) // an unneeded override fails
          expect(lowest).toBeGreaterThanOrEqual(override.floor)
        } else {
          expect(lowest).toBeGreaterThanOrEqual(min)
        }
      })
    }
  }

  test("every override names a row, and carries a reason and a decision", () => {
    for (const override of OVERRIDES) {
      expect(
        PAIRS.some(
          ([, fg, stack]) => fg === override.fg && stack === override.stack,
        ),
      ).toBe(true)
      expect(override.reason).not.toBe("")
      expect(override.decided).toMatch(/^Trav, \d{4}-\d{2}-\d{2}$/)
    }
  })

  test("every token is in a row or in UNCHECKED", () => {
    const covered = new Set(
      PAIRS.flatMap(([, fg, stack]) => [fg, ...stack.split(" › ")]),
    )
    // canvas-top is covered through the both-ends rule.
    const endsOnCanvas = PAIRS.some(([, , stack]) => stack.endsWith("canvas"))
    if (endsOnCanvas) covered.add("canvas-top")
    const uncovered = [...tokens.keys()].filter(
      (name) => !covered.has(name) && !(name in UNCHECKED),
    )
    expect(uncovered).toEqual([])
  })

  test("UNCHECKED names defined tokens, each with a reason", () => {
    for (const [name, reason] of Object.entries(UNCHECKED)) {
      expect(tokens.has(name)).toBe(true)
      expect(reason).not.toBe("")
    }
    expect(Object.keys(UNCHECKED)).toHaveLength(6)
  })

  test("the helper checks a failing pair at the canvas-top end too", () => {
    const fixture = parseTokens(
      ":root { --color-fg: light-dark(#777777, #777777); --color-canvas: light-dark(#ffffff, #ffffff); --color-canvas-top: light-dark(#000000, #000000); }",
    )
    const [low = 0, high = 0] = ratiosFor(fixture, "fg", "canvas", "light")
    expect(low).toBeLessThan(high)
    expect(low).toBeLessThan(4.5)
  })
})

describe("usage viewer colours: chips and card dots", () => {
  const text = page?.text ?? ""

  test("the Refreshing chips take accent-strong", () => {
    for (const label of ["Refreshing summary...", "Refreshing details..."]) {
      expect(text).toMatch(
        new RegExp(
          `color: var\\(--color-accent-strong\\);">${escapeRegExp(label)}<`,
        ),
      )
    }
  })

  test("the Unlimited chip keeps accent", () => {
    expect(text).toMatch(/color: var\(--color-accent\);">Unlimited</)
  })

  test("the Cache Hit Rate card dot reads series-cache-read", () => {
    expect(text).toMatch(
      /"Cache Hit Rate",\s+formatCacheHitRate\(totals\),\s+"var\(--color-series-cache-read\)"/,
    )
  })

  test("a drifted token value fails its row", () => {
    const drifted = parseTokens(
      text.replace(
        "--color-ink-soft: light-dark(#5f6f86",
        "--color-ink-soft: light-dark(#94a3b8",
      ),
    )
    const [lowest = 0] = ratiosFor(drifted, "ink-soft", "canvas", "light")
    expect(lowest).toBeLessThan(4.5)
  })
})
