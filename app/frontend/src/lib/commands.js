import {
  Layout, Boxes, Server, Network, Plug, Activity, Settings, Home,
  PanelLeftClose, Play, Square, RefreshCw, GitBranch, FolderOpen,
  Hammer, TestTube, Paintbrush, FileSearch, Database, ArrowUp, ArrowDown,
  FileCode, Copy, CheckCircle, Trash2, Plus, Search, Tag, LayoutGrid,
  Heart, ScrollText,
} from 'lucide-react';

// ── Navigation ──────────────────────────────────────────────────────────────

const navigation = [
  {
    id: 'nav:home',
    label: 'Go to Home',
    category: 'Navigation',
    icon: Home,
    keywords: ['home', 'landing', 'dashboard'],
    aliases: ['main page', 'start screen'],
    action: (ctx) => ctx.navigate('home'),
  },
  {
    id: 'nav:projects',
    label: 'Go to Projects',
    category: 'Navigation',
    icon: Layout,
    keywords: ['projects', 'repos', 'submodules'],
    action: (ctx) => ctx.navigate('projects'),
  },
  {
    id: 'nav:infrastructure',
    label: 'Go to Infrastructure',
    category: 'Navigation',
    icon: Boxes,
    keywords: ['infrastructure', 'docker', 'services'],
    action: (ctx) => ctx.navigate('infrastructure'),
  },
  {
    id: 'nav:backend',
    label: 'Go to Backend',
    category: 'Navigation',
    icon: Server,
    keywords: ['backend', 'api', 'go'],
    action: (ctx) => ctx.navigate('backend'),
  },
  {
    id: 'nav:mesh',
    label: 'Go to WabiSaby Mesh',
    category: 'Navigation',
    icon: Network,
    keywords: ['mesh', 'network', 'coordinator'],
    action: (ctx) => ctx.navigate('mesh'),
  },
  {
    id: 'nav:plugins',
    label: 'Go to Plugin Infrastructure',
    category: 'Navigation',
    icon: Plug,
    keywords: ['plugins', 'capabilities', 'workers'],
    action: (ctx) => ctx.navigate('plugins'),
  },
  {
    id: 'nav:activity',
    label: 'Go to Activity',
    category: 'Navigation',
    icon: Activity,
    keywords: ['activity', 'logs', 'events'],
    action: (ctx) => ctx.navigate('activity'),
  },
  {
    id: 'nav:settings',
    label: 'Go to Settings',
    category: 'Navigation',
    icon: Settings,
    keywords: ['settings', 'config', 'preferences', 'environment'],
    action: (ctx) => ctx.navigate('settings'),
  },
];

// ── General ─────────────────────────────────────────────────────────────────

const general = [
  {
    id: 'general:toggle-sidebar',
    label: 'Toggle Sidebar',
    category: 'General',
    icon: PanelLeftClose,
    keywords: ['sidebar', 'collapse', 'expand', 'panel'],
    aliases: ['hide sidebar', 'show sidebar', 'close panel', 'open panel'],
    action: (ctx) => ctx.toggleSidebar(),
  },
];

// ── Projects ────────────────────────────────────────────────────────────────

const projects = [
  {
    id: 'project:clone',
    label: 'Clone Project',
    category: 'Projects',
    icon: GitBranch,
    keywords: ['clone', 'git', 'download'],
    aliases: ['git clone', 'download repo'],
    feedback: (param) => ({ pending: `Cloning ${param}...`, success: `${param} cloned`, error: `Failed to clone ${param}` }),
    getParams: async (ctx) => {
      const res = await ctx.api.projects.list();
      if (!res.success) return [];
      return (res.data || [])
        .filter((p) => p.status === 'not-cloned')
        .map((p) => ({ id: p.name, label: p.name }));
    },
    action: (ctx, param) => ctx.api.projects.clone(param),
  },
  {
    id: 'project:update',
    label: 'Update Project',
    category: 'Projects',
    icon: RefreshCw,
    keywords: ['update', 'pull', 'git', 'fetch'],
    feedback: (param) => ({ pending: `Updating ${param}...`, success: `${param} updated`, error: `Failed to update ${param}` }),
    getParams: async (ctx) => {
      const res = await ctx.api.projects.list();
      if (!res.success) return [];
      return (res.data || [])
        .filter((p) => p.status !== 'not-cloned')
        .map((p) => ({ id: p.name, label: p.name }));
    },
    action: (ctx, param) => ctx.api.projects.update(param),
  },
  {
    id: 'project:open',
    label: 'Open Project in Editor',
    category: 'Projects',
    icon: FolderOpen,
    keywords: ['open', 'editor', 'cursor', 'vscode', 'workspace'],
    feedback: (param) => ({ pending: `Opening ${param}...`, success: `${param} opened in editor` }),
    getParams: async (ctx) => {
      const res = await ctx.api.projects.list();
      if (!res.success) return [];
      return (res.data || [])
        .filter((p) => p.status !== 'not-cloned')
        .map((p) => ({ id: p.name, label: p.name }));
    },
    action: (ctx, param) => ctx.api.projects.open(param),
  },
  {
    id: 'project:build',
    label: 'Build Project',
    category: 'Projects',
    icon: Hammer,
    keywords: ['build', 'compile', 'make'],
    feedback: (param) => ({ pending: `Building ${param}...`, success: `Build started for ${param}` }),
    getParams: async (ctx) => {
      const res = await ctx.api.projects.list();
      if (!res.success) return [];
      return (res.data || [])
        .filter((p) => p.status !== 'not-cloned')
        .map((p) => ({ id: p.name, label: p.name }));
    },
    action: (ctx, param) => ctx.api.projects.startStream(param, 'build'),
  },
  {
    id: 'project:test',
    label: 'Test Project',
    category: 'Projects',
    icon: TestTube,
    keywords: ['test', 'unit', 'integration'],
    feedback: (param) => ({ pending: `Testing ${param}...`, success: `Tests started for ${param}` }),
    getParams: async (ctx) => {
      const res = await ctx.api.projects.list();
      if (!res.success) return [];
      return (res.data || [])
        .filter((p) => p.status !== 'not-cloned')
        .map((p) => ({ id: p.name, label: p.name }));
    },
    action: (ctx, param) => ctx.api.projects.startStream(param, 'test'),
  },
  {
    id: 'project:format',
    label: 'Format Project',
    category: 'Projects',
    icon: Paintbrush,
    keywords: ['format', 'fmt', 'prettier', 'gofmt'],
    feedback: (param) => ({ pending: `Formatting ${param}...`, success: `Format started for ${param}` }),
    getParams: async (ctx) => {
      const res = await ctx.api.projects.list();
      if (!res.success) return [];
      return (res.data || [])
        .filter((p) => p.status !== 'not-cloned')
        .map((p) => ({ id: p.name, label: p.name }));
    },
    action: (ctx, param) => ctx.api.projects.startStream(param, 'format'),
  },
  {
    id: 'project:lint',
    label: 'Lint Project',
    category: 'Projects',
    icon: FileSearch,
    keywords: ['lint', 'check', 'golangci', 'eslint'],
    feedback: (param) => ({ pending: `Linting ${param}...`, success: `Lint started for ${param}` }),
    getParams: async (ctx) => {
      const res = await ctx.api.projects.list();
      if (!res.success) return [];
      return (res.data || [])
        .filter((p) => p.status !== 'not-cloned')
        .map((p) => ({ id: p.name, label: p.name }));
    },
    action: (ctx, param) => ctx.api.projects.startStream(param, 'lint'),
  },
  {
    id: 'project:build-all',
    label: 'Build All Projects',
    category: 'Projects',
    icon: Hammer,
    keywords: ['build', 'all', 'bulk'],
    aliases: ['compile everything', 'make all'],
    feedback: () => ({ pending: 'Building all projects...', success: 'Bulk build started' }),
    action: (ctx) => ctx.api.projects.startBulkStream('build'),
  },
  {
    id: 'project:test-all',
    label: 'Test All Projects',
    category: 'Projects',
    icon: TestTube,
    keywords: ['test', 'all', 'bulk'],
    aliases: ['run all tests', 'check everything'],
    feedback: () => ({ pending: 'Testing all projects...', success: 'Bulk test started' }),
    action: (ctx) => ctx.api.projects.startBulkStream('test'),
  },
  {
    id: 'project:format-all',
    label: 'Format All Projects',
    category: 'Projects',
    icon: Paintbrush,
    keywords: ['format', 'all', 'bulk'],
    aliases: ['prettify all', 'fmt everything'],
    feedback: () => ({ pending: 'Formatting all projects...', success: 'Bulk format started' }),
    action: (ctx) => ctx.api.projects.startBulkStream('format'),
  },
  {
    id: 'project:lint-all',
    label: 'Lint All Projects',
    category: 'Projects',
    icon: FileSearch,
    keywords: ['lint', 'all', 'bulk'],
    aliases: ['check all code', 'analyze everything'],
    feedback: () => ({ pending: 'Linting all projects...', success: 'Bulk lint started' }),
    action: (ctx) => ctx.api.projects.startBulkStream('lint'),
  },
  {
    id: 'project:sync-submodules',
    label: 'Sync Submodules',
    category: 'Projects',
    icon: GitBranch,
    keywords: ['sync', 'submodule', 'git', 'refs'],
    aliases: ['update submodules', 'git submodule sync'],
    feedback: () => ({ pending: 'Syncing submodules...', success: 'Submodules synced', error: 'Failed to sync submodules' }),
    action: (ctx) => ctx.api.submodule.sync('Sync from command palette'),
  },
  {
    id: 'project:tags',
    label: 'View Project Tags',
    category: 'Projects',
    icon: Tag,
    keywords: ['tags', 'release', 'version', 'git'],
    getParams: async (ctx) => {
      const res = await ctx.api.projects.list();
      if (!res.success) return [];
      return (res.data || [])
        .filter((p) => p.status !== 'not-cloned')
        .map((p) => ({ id: p.name, label: p.name }));
    },
    action: (ctx) => {
      ctx.navigate('projects');
    },
  },
];

// ── Infrastructure (Docker) ─────────────────────────────────────────────────

const infrastructure = [
  {
    id: 'infra:start',
    label: 'Start Infrastructure Service',
    category: 'Infrastructure',
    icon: Play,
    keywords: ['start', 'docker', 'service', 'container'],
    feedback: (param) => ({ pending: `Starting ${param}...`, success: `${param} started`, error: `Failed to start ${param}` }),
    getParams: async (ctx) => {
      const list = await ctx.api.services.list();
      return (Array.isArray(list) ? list : []).map((s) => ({
        id: s.name,
        label: s.name,
        description: s.status === 'running' ? 'Running' : 'Stopped',
      }));
    },
    action: (ctx, param) => ctx.api.services.start(param),
  },
  {
    id: 'infra:stop',
    label: 'Stop Infrastructure Service',
    category: 'Infrastructure',
    icon: Square,
    keywords: ['stop', 'docker', 'service', 'container'],
    feedback: (param) => ({ pending: `Stopping ${param}...`, success: `${param} stopped`, error: `Failed to stop ${param}` }),
    getParams: async (ctx) => {
      const list = await ctx.api.services.list();
      return (Array.isArray(list) ? list : []).map((s) => ({
        id: s.name,
        label: s.name,
        description: s.status === 'running' ? 'Running' : 'Stopped',
      }));
    },
    action: (ctx, param) => ctx.api.services.stop(param),
  },
  {
    id: 'infra:start-all',
    label: 'Start All Infrastructure',
    category: 'Infrastructure',
    icon: Play,
    keywords: ['start', 'all', 'docker', 'services', 'containers'],
    aliases: ['boot docker', 'spin up everything', 'launch all containers'],
    feedback: () => ({ pending: 'Starting all services...', success: 'All services started', error: 'Failed to start all services' }),
    action: (ctx) => ctx.api.services.startAll(),
  },
  {
    id: 'infra:stop-all',
    label: 'Stop All Infrastructure',
    category: 'Infrastructure',
    icon: Square,
    keywords: ['stop', 'all', 'docker', 'services', 'containers'],
    aliases: ['kill docker', 'shut down everything', 'terminate all containers'],
    feedback: () => ({ pending: 'Stopping all services...', success: 'All services stopped', error: 'Failed to stop all services' }),
    action: (ctx) => ctx.api.services.stopAll(),
  },
];

// ── Backend Services ────────────────────────────────────────────────────────

const backend = [
  {
    id: 'backend:start',
    label: 'Start Backend Service',
    category: 'Backend',
    icon: Play,
    keywords: ['start', 'backend', 'service', 'go', 'api'],
    feedback: (param) => ({ pending: `Starting ${param}...`, success: `${param} started`, error: `Failed to start ${param}` }),
    getParams: async (ctx) => {
      const list = await ctx.api.backend.list();
      return (Array.isArray(list) ? list : []).map((s) => ({
        id: s.name,
        label: s.name,
        description: s.status === 'running' ? 'Running' : 'Stopped',
      }));
    },
    action: (ctx, param) => ctx.api.backend.start(param),
  },
  {
    id: 'backend:stop',
    label: 'Stop Backend Service',
    category: 'Backend',
    icon: Square,
    keywords: ['stop', 'backend', 'service', 'go', 'api'],
    feedback: (param) => ({ pending: `Stopping ${param}...`, success: `${param} stopped`, error: `Failed to stop ${param}` }),
    getParams: async (ctx) => {
      const list = await ctx.api.backend.list();
      return (Array.isArray(list) ? list : []).map((s) => ({
        id: s.name,
        label: s.name,
        description: s.status === 'running' ? 'Running' : 'Stopped',
      }));
    },
    action: (ctx, param) => ctx.api.backend.stop(param),
  },
  {
    id: 'backend:health',
    label: 'Check Backend Health',
    category: 'Backend',
    icon: Heart,
    keywords: ['health', 'check', 'probe', 'backend'],
    feedback: (param) => ({ pending: `Checking health of ${param}...`, success: `${param} is healthy`, error: `${param} health check failed` }),
    getParams: async (ctx) => {
      const list = await ctx.api.backend.list();
      return (Array.isArray(list) ? list : []).map((s) => ({
        id: s.name,
        label: s.name,
        description: s.status === 'running' ? 'Running' : 'Stopped',
      }));
    },
    action: (ctx, param) => ctx.api.backend.health(param),
  },
  {
    id: 'backend:start-group',
    label: 'Start Backend Group',
    category: 'Backend',
    icon: LayoutGrid,
    keywords: ['start', 'group', 'all', 'backend', 'mesh', 'plugins'],
    feedback: (param) => ({ pending: `Starting group: ${param}...`, success: `Group ${param} started`, error: `Failed to start group ${param}` }),
    getParams: async () => [
      { id: 'backend', label: 'Backend' },
      { id: 'mesh', label: 'Mesh' },
      { id: 'plugins', label: 'Plugins' },
    ],
    action: (ctx, param) => ctx.api.backend.startGroup(param),
  },
  {
    id: 'backend:stop-group',
    label: 'Stop Backend Group',
    category: 'Backend',
    icon: LayoutGrid,
    keywords: ['stop', 'group', 'all', 'backend', 'mesh', 'plugins'],
    feedback: (param) => ({ pending: `Stopping group: ${param}...`, success: `Group ${param} stopped`, error: `Failed to stop group ${param}` }),
    getParams: async () => [
      { id: 'backend', label: 'Backend' },
      { id: 'mesh', label: 'Mesh' },
      { id: 'plugins', label: 'Plugins' },
    ],
    action: (ctx, param) => ctx.api.backend.stopGroup(param),
  },
];

// ── Migrations ──────────────────────────────────────────────────────────────

const migrations = [
  {
    id: 'migration:up',
    label: 'Run Migrations Up',
    category: 'Migrations',
    icon: ArrowUp,
    keywords: ['migration', 'migrate', 'up', 'apply', 'database'],
    aliases: ['apply db changes', 'migrate database'],
    feedback: () => ({ pending: 'Running migrations up...', success: 'Migrations applied', error: 'Migration failed' }),
    action: (ctx) => ctx.api.migration.runUp(),
  },
  {
    id: 'migration:down',
    label: 'Run Migrations Down',
    category: 'Migrations',
    icon: ArrowDown,
    keywords: ['migration', 'rollback', 'down', 'revert', 'database'],
    aliases: ['undo migration', 'revert db changes'],
    feedback: () => ({ pending: 'Rolling back migration...', success: 'Migration rolled back', error: 'Rollback failed' }),
    action: (ctx) => ctx.api.migration.runDown(),
  },
  {
    id: 'migration:status',
    label: 'View Migration Status',
    category: 'Migrations',
    icon: Database,
    keywords: ['migration', 'status', 'version', 'database'],
    action: (ctx) => {
      ctx.navigate('backend');
    },
  },
];

// ── Protobuf ────────────────────────────────────────────────────────────────

const protobuf = [
  {
    id: 'proto:generate',
    label: 'Generate Protobuf Code',
    category: 'Protobuf',
    icon: FileCode,
    keywords: ['proto', 'protobuf', 'generate', 'grpc', 'make'],
    aliases: ['proto gen', 'codegen grpc', 'buf generate'],
    feedback: () => ({ pending: 'Generating protobuf code...', success: 'Protobuf generation started' }),
    action: (ctx) => ctx.api.proto.startStream(),
  },
  {
    id: 'proto:status',
    label: 'View Proto Status',
    category: 'Protobuf',
    icon: Search,
    keywords: ['proto', 'protobuf', 'status', 'outdated'],
    feedback: () => ({ pending: 'Checking proto status...' }),
    action: async (ctx) => {
      const status = await ctx.api.proto.getStatus();
      return status;
    },
  },
];

// ── Environment ─────────────────────────────────────────────────────────────

const environment = [
  {
    id: 'env:copy-example',
    label: 'Copy env.example to .env',
    category: 'Environment',
    icon: Copy,
    keywords: ['env', 'environment', 'copy', 'example', 'dotenv'],
    aliases: ['setup env', 'init environment', 'create dotenv'],
    feedback: () => ({ pending: 'Copying env.example...', success: 'env.example copied to .env', error: 'Failed to copy env.example' }),
    action: (ctx) => ctx.api.env.copyExample(),
  },
  {
    id: 'env:validate',
    label: 'Validate Environment',
    category: 'Environment',
    icon: CheckCircle,
    keywords: ['env', 'validate', 'check', 'environment'],
    feedback: () => ({ pending: 'Validating environment...', success: 'Environment is valid', error: 'Environment validation failed' }),
    action: (ctx) => ctx.api.env.validate(),
  },
  {
    id: 'env:settings',
    label: 'Manage Environment Variables',
    category: 'Environment',
    icon: Settings,
    keywords: ['env', 'environment', 'variables', 'manage', 'edit'],
    action: (ctx) => ctx.navigate('settings'),
  },
];

// ── Export ───────────────────────────────────────────────────────────────────

export const ALL_COMMANDS = [
  ...navigation,
  ...general,
  ...projects,
  ...infrastructure,
  ...backend,
  ...migrations,
  ...protobuf,
  ...environment,
];

/**
 * Returns the ordered list of unique category names.
 */
export function getCategories() {
  const seen = new Set();
  const cats = [];
  for (const cmd of ALL_COMMANDS) {
    if (!seen.has(cmd.category)) {
      seen.add(cmd.category);
      cats.push(cmd.category);
    }
  }
  return cats;
}
