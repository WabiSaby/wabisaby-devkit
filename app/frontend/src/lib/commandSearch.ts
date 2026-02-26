/**
 * commandSearch.js – Intent-aware command search engine
 *
 * This module provides an intelligent search engine for the command palette
 * that goes beyond simple fuzzy matching. It understands user intent through:
 *
 *   - Synonym expansion (e.g., "run" matches both "start" and "test")
 *   - Target resolution (e.g., "docker" matches Infrastructure commands)
 *   - Multi-token scoring with coverage penalties
 *   - Prefix, acronym, and subsequence matching
 *   - Stop word removal for natural language queries
 *
 * ── Dynamic Context ────────────────────────────────────────────────────────
 *
 *   The engine supports runtime keywords via `setDynamicKeywords()`. When the
 *   palette opens, it pre-fetches live data (service names, project names, etc.)
 *   and injects them as searchable keywords. This way, typing "redis" surfaces
 *   "Start Infrastructure Service" because "redis" is a known live service.
 *
 * ── Extensibility ──────────────────────────────────────────────────────────
 *
 *   To teach the engine new vocabulary:
 *     1. Add verb synonyms to VERB_SYNONYMS
 *     2. Add target synonyms to TARGET_SYNONYMS
 *     3. Add `aliases: [...]` to command definitions in commands.js
 *     4. Call `engine.setDynamicKeywords(cmdId, [...])` for live data
 *
 *   To add new matching strategies:
 *     1. Add a new scoring constant to SCORES
 *     2. Add the matching logic as a step in _scoreToken()
 *
 * ── Scoring Pipeline (per token) ───────────────────────────────────────────
 *
 *   Each query token is scored against every command. The token receives the
 *   maximum score from any of these matchers (checked in priority order):
 *
 *   | Priority | Matcher             | Score | Description                        |
 *   |----------|---------------------|-------|------------------------------------|
 *   | 1        | Exact label word    |  100  | Token = a word in the label        |
 *   | 2        | Exact keyword       |   90  | Token = one of the keywords        |
 *   | 3        | Exact alias word    |   85  | Token = a word in an alias         |
 *   | 4        | Verb synonym        |   80  | Token resolves to same verb        |
 *   | 5        | Target synonym      |   80  | Token resolves to same target      |
 *   | 6        | Exact category word |   70  | Token = a word in the category     |
 *   | 7        | ID segment match    |   65  | Token = a segment of the cmd ID    |
 *   | 8        | Prefix on label     |   60  | Token is a prefix of a label word  |
 *   | 9        | Prefix on keyword   |   55  | Token is a prefix of a keyword     |
 *   | 10       | Acronym match       |   50  | Token matches label initials       |
 *   | 11       | Contains match      |   35  | Label/keyword contains the token   |
 *   | 12       | Subsequence match   |   30  | Token is a subsequence of a word   |
 *
 *   Command total = sum(tokenScores) * coverageMultiplier
 *   where coverageMultiplier = 0.3 + 0.7 * (matchedTokens / totalTokens)
 */

// ── Stop Words ─────────────────────────────────────────────────────────────
// Common filler words stripped from queries so "I want to start the backend"
// becomes tokens ["start", "backend"].

const STOP_WORDS = new Set([
  'to', 'the', 'a', 'an', 'in', 'on', 'for', 'my', 'i',
  'want', 'need', 'please', 'can', 'you', 'do', 'this', 'that',
  'it', 'is', 'of', 'with', 'just', 'let', 'me', 'us',
]);

// ── Verb Synonym Dictionary ────────────────────────────────────────────────
// Maps a canonical verb to an array of synonyms. A synonym can appear in
// multiple groups (e.g., "run" maps to both "start" and "test"), which
// allows the scoring to naturally disambiguate based on other query tokens.
//
// To extend: add a new entry or append synonyms to an existing one.

const VERB_SYNONYMS = {
  start:    ['run', 'launch', 'boot', 'begin', 'execute', 'spin', 'fire', 'up', 'enable', 'activate'],
  stop:     ['kill', 'halt', 'terminate', 'shutdown', 'end', 'quit', 'down', 'disable', 'deactivate'],
  build:    ['compile', 'make', 'assemble', 'package'],
  test:     ['run', 'spec', 'unittest', 'tests'],
  clone:    ['download', 'checkout', 'grab'],
  update:   ['refresh', 'pull', 'upgrade', 'fetch'],
  open:     ['edit', 'launch', 'view', 'show'],
  navigate: ['go', 'goto', 'switch', 'jump', 'visit', 'nav'],
  generate: ['gen', 'create', 'produce', 'codegen'],
  format:   ['fmt', 'prettify', 'beautify', 'pretty', 'autoformat'],
  lint:     ['analyze', 'scan', 'linter', 'check'],
  validate: ['verify', 'check'],
  sync:     ['synchronize', 'reconcile'],
  copy:     ['cp', 'duplicate'],
  toggle:   ['switch', 'flip'],
  migrate:  ['migration', 'migrate'],
  rollback: ['revert', 'undo', 'downgrade'],
};

// ── Target Synonym Dictionary ──────────────────────────────────────────────
// Maps a canonical target noun to alternatives users might type.
//
// To extend: add a new entry or append synonyms to an existing one.

const TARGET_SYNONYMS = {
  infrastructure: ['docker', 'container', 'infra', 'compose', 'containers', 'services'],
  backend:        ['api', 'server', 'go', 'golang', 'microservice', 'microservices'],
  project:        ['repo', 'repository', 'submodule', 'code', 'module', 'projects'],
  migration:      ['db', 'database', 'schema', 'sql', 'migrations'],
  protobuf:       ['proto', 'grpc', 'buf', 'rpc', 'protobuf'],
  environment:    ['env', 'config', 'dotenv', 'vars', 'variables', 'envvars'],
  home:           ['dashboard', 'main', 'landing'],
  settings:       ['preferences', 'prefs', 'options', 'configuration'],
  sidebar:        ['panel', 'drawer', 'menu', 'sidenav'],
  mesh:           ['network', 'coordinator', 'p2p', 'wabisaby'],
  plugins:        ['extensions', 'addons', 'capabilities', 'workers', 'plugin'],
  activity:       ['logs', 'events', 'history', 'audit'],
  submodule:      ['submodules', 'refs', 'gitmodules'],
};

// ── Scoring Constants ──────────────────────────────────────────────────────

const SCORES = {
  EXACT_LABEL:    100,
  EXACT_KEYWORD:   90,
  EXACT_ALIAS:     85,
  VERB_SYNONYM:    80,
  TARGET_SYNONYM:  80,
  EXACT_CATEGORY:  70,
  ID_SEGMENT:      65,
  PREFIX_LABEL:    60,
  PREFIX_KEYWORD:  55,
  ACRONYM:         50,
  CONTAINS:        35,
  SUBSEQUENCE:     30,
};

// ── Reverse Lookup Maps ────────────────────────────────────────────────────
// Built once at module load. Maps each synonym → Set of canonical forms.

function buildReverseMap(dict: Record<string, string[]>) {
  const reverse: Record<string, Set<string>> = {};
  for (const [canonical, synonyms] of Object.entries(dict)) {
    // The canonical word maps to itself
    if (!reverse[canonical]) reverse[canonical] = new Set();
    reverse[canonical].add(canonical);
    // Each synonym maps to the canonical form
    for (const syn of synonyms) {
      if (!reverse[syn]) reverse[syn] = new Set();
      reverse[syn].add(canonical);
    }
  }
  return reverse;
}

const verbLookup   = buildReverseMap(VERB_SYNONYMS);
const targetLookup = buildReverseMap(TARGET_SYNONYMS);

// ── Text Utilities ─────────────────────────────────────────────────────────

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim();
}

function tokenize(query) {
  return normalize(query)
    .split(/[\s-]+/)
    .filter((t) => t.length > 0 && !STOP_WORDS.has(t));
}

function extractWords(str) {
  return normalize(str).split(/[\s-]+/).filter(Boolean);
}

function isPrefix(token, word) {
  return token.length >= 1 && word.startsWith(token);
}

function isSubsequence(token, word) {
  if (token.length < 2 || token.length >= word.length) return false;
  let ti = 0;
  for (let wi = 0; wi < word.length && ti < token.length; wi++) {
    if (token[ti] === word[wi]) ti++;
  }
  return ti === token.length;
}

function getAcronym(words) {
  return words.map((w) => w[0] || '').join('');
}

// ── Command Search Engine ──────────────────────────────────────────────────

export interface IndexEntry {
  cmd: unknown;
  labelWords: string[];
  keywords: string[];
  aliasTokens: string[];
  categoryWords: string[];
  idSegments: string[];
  acronym: string;
  verbs: Set<string>;
  targets: Set<string>;
  labelStr: string;
  keywordStr: string;
  dynamicKeywords: string[];
  dynamicKeywordsStr: string;
}

export class CommandSearchEngine {
  commands: unknown[];
  _index: IndexEntry[];

  /**
   * @param commands – array of command objects from ALL_COMMANDS
   */
  constructor(commands: unknown[]) {
    this.commands = commands;
    this._index = commands.map((cmd: unknown) => this._indexCommand(cmd as { id: string; label: string; category: string; keywords?: string[]; aliases?: string[] }));
  }

  /**
   * Pre-compute searchable metadata for a command.
   * This runs once per command at construction time.
   */
  _indexCommand(cmd: { id: string; label: string; category: string; keywords?: string[]; aliases?: string[] }) {
    const labelWords    = extractWords(cmd.label);
    const keywords      = (cmd.keywords || []).map((k) => normalize(k));
    const aliasTokens   = (cmd.aliases || []).flatMap((a) => extractWords(a));
    const categoryWords = extractWords(cmd.category);
    const idSegments    = cmd.id.split(':').map((s) => normalize(s));
    const acronym       = getAcronym(labelWords);

    // Collect all searchable words to detect canonical verbs & targets
    const allWords = [...labelWords, ...keywords, ...aliasTokens, ...categoryWords, ...idSegments];

    const verbs   = new Set<string>();
    const targets = new Set<string>();
    for (const w of allWords) {
      const vSet = verbLookup[w];
      if (vSet) for (const v of vSet) verbs.add(v);
      const tSet = targetLookup[w];
      if (tSet) for (const t of tSet) targets.add(t);
    }

    return {
      cmd,
      labelWords,
      keywords,
      aliasTokens,
      categoryWords,
      idSegments,
      acronym,
      verbs,
      targets,
      // Pre-joined for "contains" matching
      labelStr:   labelWords.join(' '),
      keywordStr: keywords.join(' '),
      // Dynamic keywords are populated at runtime via setDynamicKeywords()
      // (e.g., actual service names like "redis", "postgres", project names, etc.)
      dynamicKeywords:    [],
      dynamicKeywordsStr: '',
    };
  }

  /**
   * Inject runtime keywords for a command (e.g., live service / project names).
   *
   * Call this after fetching dynamic data so that searches like "redis" or
   * "wabisaby-core" surface the relevant parameterized commands.
   *
   * @param {string} commandId – the command's id (e.g., "infra:start")
   * @param {string[]} keywords – array of dynamic keyword strings
   */
  setDynamicKeywords(commandId, keywords) {
    const entry = this._index.find((e) => (e.cmd as { id: string }).id === commandId);
    if (!entry) return;
    entry.dynamicKeywords    = keywords.flatMap((k) => extractWords(k));
    entry.dynamicKeywordsStr = entry.dynamicKeywords.join(' ');
  }

  /**
   * Clear all dynamic keywords (e.g., on palette close or permission change).
   */
  clearDynamicKeywords() {
    for (const entry of this._index) {
      entry.dynamicKeywords    = [];
      entry.dynamicKeywordsStr = '';
    }
  }

  /**
   * Search commands by query string.
   * Returns commands sorted by relevance. Returns ALL commands when query is empty.
   *
   * @param {string} query – the user's search input
   * @returns {Array} – sorted array of command objects
   */
  search(query) {
    const tokens = tokenize(query);
    if (tokens.length === 0) return this.commands;

    const scored = [];
    for (const entry of this._index) {
      const score = this._scoreCommand(tokens, entry);
      if (score > 0) {
        scored.push({ item: entry.cmd, score });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map((s) => s.item);
  }

  /**
   * Compute a composite score for a command against the query tokens.
   * Applies a coverage multiplier to penalize unmatched tokens.
   */
  _scoreCommand(tokens: string[], entry: IndexEntry) {
    let totalScore = 0;
    let matchedTokens = 0;

    for (const token of tokens) {
      const tokenScore = this._scoreToken(token, entry);
      totalScore += tokenScore;
      if (tokenScore > 0) matchedTokens++;
    }

    if (tokens.length === 0) return 0;

    // Coverage multiplier: ensures all tokens must contribute for a high score.
    // 100% match = full score, 0% match = 30% of raw score (still shows partial matches).
    const coverage = matchedTokens / tokens.length;
    return totalScore * (0.3 + 0.7 * coverage);
  }

  /**
   * Score a single token against a command's indexed data.
   * Returns the maximum score from any matcher that fires.
   *
   * Matchers are checked roughly in priority order with early-exit
   * optimizations (skip lower-priority checks once a high score is found).
   */
  _scoreToken(token: string, idx: IndexEntry) {
    let best = 0;

    // 1. Exact match on label words
    if (idx.labelWords.includes(token)) {
      best = Math.max(best, SCORES.EXACT_LABEL);
    }

    // 2. Exact match on keywords
    if (idx.keywords.includes(token)) {
      best = Math.max(best, SCORES.EXACT_KEYWORD);
    }

    // 2b. Exact match on dynamic keywords (live service/project names)
    if (idx.dynamicKeywords.length > 0 && idx.dynamicKeywords.includes(token)) {
      best = Math.max(best, SCORES.EXACT_KEYWORD);
    }

    // 3. Exact match on alias tokens
    if (idx.aliasTokens.length > 0 && idx.aliasTokens.includes(token)) {
      best = Math.max(best, SCORES.EXACT_ALIAS);
    }

    // Early exit: already at max practical score
    if (best >= SCORES.EXACT_LABEL) return best;

    // 4. Verb synonym match
    const canonicalVerbs = verbLookup[token];
    if (canonicalVerbs) {
      for (const cv of canonicalVerbs) {
        if (idx.verbs.has(cv)) {
          best = Math.max(best, SCORES.VERB_SYNONYM);
          break;
        }
      }
    }

    // 5. Target synonym match
    const canonicalTargets = targetLookup[token];
    if (canonicalTargets) {
      for (const ct of canonicalTargets) {
        if (idx.targets.has(ct)) {
          best = Math.max(best, SCORES.TARGET_SYNONYM);
          break;
        }
      }
    }

    // 6. Category word match
    if (idx.categoryWords.includes(token)) {
      best = Math.max(best, SCORES.EXACT_CATEGORY);
    }

    // 7. ID segment match (e.g., "proto" matches "proto:generate")
    if (idx.idSegments.includes(token)) {
      best = Math.max(best, SCORES.ID_SEGMENT);
    }

    // Remaining matchers only run if we haven't found a strong match
    if (best >= SCORES.VERB_SYNONYM) return best;

    // 8. Prefix match on label words
    for (const w of idx.labelWords) {
      if (isPrefix(token, w)) {
        best = Math.max(best, SCORES.PREFIX_LABEL);
        break;
      }
    }

    // 9. Prefix match on keywords
    if (best < SCORES.PREFIX_KEYWORD) {
      for (const w of idx.keywords) {
        if (isPrefix(token, w)) {
          best = Math.max(best, SCORES.PREFIX_KEYWORD);
          break;
        }
      }
    }

    // 9b. Prefix match on dynamic keywords
    if (best < SCORES.PREFIX_KEYWORD && idx.dynamicKeywords.length > 0) {
      for (const w of idx.dynamicKeywords) {
        if (isPrefix(token, w)) {
          best = Math.max(best, SCORES.PREFIX_KEYWORD);
          break;
        }
      }
    }

    // 10. Acronym match (token matches first letters of label)
    if (best < SCORES.ACRONYM && token.length >= 2 && idx.acronym.startsWith(token)) {
      best = Math.max(best, SCORES.ACRONYM);
    }

    // 11. Contains match (2+ chars for contains within words)
    if (best < SCORES.CONTAINS && token.length >= 2) {
      if (idx.labelStr.includes(token) || idx.keywordStr.includes(token) || idx.dynamicKeywordsStr.includes(token)) {
        best = Math.max(best, SCORES.CONTAINS);
      }
    }

    // 12. Subsequence match
    if (best < SCORES.SUBSEQUENCE && token.length >= 2) {
      const allWords = [...idx.labelWords, ...idx.keywords, ...idx.dynamicKeywords];
      for (const w of allWords) {
        if (isSubsequence(token, w)) {
          best = Math.max(best, SCORES.SUBSEQUENCE);
          break;
        }
      }
    }

    return best;
  }
}

// ── Parameter Search ───────────────────────────────────────────────────────
// Lighter search function for the two-step parameter selection flow.
// Uses exact, prefix, and contains matching on label and description.

/**
 * Creates a search function for a parameter list.
 *
 * @param {Array} params – array of { id, label, description? } objects
 * @returns {Function} – (query: string) => sortedParams[]
 */
export function createParamSearcher(params) {
  return (query) => {
    const tokens = tokenize(query);
    if (tokens.length === 0) return params;

    const scored = params.map((param) => {
      const labelWords = extractWords(param.label);
      const descWords  = extractWords(param.description || '');
      const allWords   = [...labelWords, ...descWords];

      let score   = 0;
      let matched = 0;

      for (const token of tokens) {
        let best = 0;

        // Exact match
        if (allWords.includes(token)) {
          best = 100;
        }

        // Prefix match
        if (best < 60) {
          for (const w of allWords) {
            if (isPrefix(token, w)) { best = Math.max(best, 60); break; }
          }
        }

        // Contains match
        if (best === 0 && token.length >= 2) {
          const str = allWords.join(' ');
          if (str.includes(token)) best = 35;
        }

        score += best;
        if (best > 0) matched++;
      }

      const coverage = tokens.length > 0 ? matched / tokens.length : 0;
      score *= (0.3 + 0.7 * coverage);

      return { item: param, score };
    });

    return scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.item);
  };
}
