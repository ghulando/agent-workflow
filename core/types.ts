// Shared contracts. Boundary assertions accompany the existing runtime checks.
export type Harness = 'pi' | 'claude' | 'codex';

export interface HistoryProcess {
  pid: number;
  comm: string;
}

export interface HistoryEntry {
  harness: Harness | 'workflow';
  path: string;
  bytes: number;
  mtimeMs: number;
  rule: string;
  snapshot: string;
  appendIdentity?: { dev: number; ino: number };
}

export interface HistoryNotice {
  path: string;
  reason: string;
}

export interface HistoryPlan {
  version: 1;
  harnesses: Harness[];
  roots: Record<Harness | 'workflow', string>;
  entries: HistoryEntry[];
  keptLive: HistoryNotice[];
  deferred: HistoryNotice[];
}

export interface HistoryDigest {
  harness: Harness;
  project: string;
  id: string;
  firstTimestamp: string | null;
  lastTimestamp: string | null;
  promptCount: number;
  firstPrompt: string;
}

export type Reviewer = 'claude' | 'codex' | 'ollama';

export interface ReviewerSettings {
  model?: string | undefined;
  transport?: 'cli' | 'pi' | undefined;
}

export interface ReviewException {
  maxRound: number;
  reason: string;
}

export interface FlowConfig {
  taskDirectory: string;
  baseBranch: string;
  featurePrefix: string;
  fixPrefix: string;
  requireReview: boolean;
  reviewers: Record<string, ReviewerSettings>;
  reviewTimeout: number;
  reviewExclude: string[];
  reviewContext: string[];
  reviewExceptions: Record<string, ReviewException>;
  shellApproval: 'workflow' | 'native';
}

export interface TypedReadCommand {
  prefix: string[];
  options: Record<string, 'flag' | 'string' | 'positiveInteger'>;
  positionals: { min: number; max: number };
}

export type ReadCommand = string[] | TypedReadCommand;

export interface ProjectConfig {
  version?: number;
  protectedBranches: string[];
  protectedPaths: string[];
  taskFiles: string[];
  doneMarker: string;
  gate: string[] | null;
  review: string[] | null;
  skillRoots: string[];
  requiredSkills: string[];
  readCommands: ReadCommand[];
  readOnlyTools: string[];
  extensions: string[];
  workflow: FlowConfig;
}

export interface Project {
  root: string;
  config: ProjectConfig;
}

export interface EditPairInput {
  oldText?: unknown;
  old_string?: unknown;
  newText?: unknown;
  new_string?: unknown;
}

export interface ToolInput extends EditPairInput {
  [key: string]: unknown;
  edits?: unknown;
  command?: unknown;
  cmd?: unknown;
  path?: unknown;
  file_path?: unknown;
  notebook_path?: unknown;
  content?: unknown;
  workdir?: unknown;
  cwd?: unknown;
  new_source?: unknown;
  subagent_type?: unknown;
  replace_all?: unknown;
}

export interface HookPayload {
  cwd: string;
  session_id?: unknown;
  hook_event_name?: string | undefined;
  tool_name?: string | undefined;
  tool_input?: ToolInput | string | undefined;
  permission_mode?: string | undefined;
  prompt?: string | undefined;
  is_error?: boolean | undefined;
}

export interface FileChange {
  path: string;
  before: string;
  after: string | null;
}

export type Action =
  | { kind: 'shell'; command: string; cwd: string; input: ToolInput }
  | { kind: 'files'; files: FileChange[] }
  | { kind: 'workspace'; paths: string[] }
  | { kind: 'read' | 'outside' | 'unknown' };

export type ShellKind = 'read' | 'branch' | 'opaque' | 'mutation';

export interface HookResult {
  decision?: 'deny' | 'ask';
  reason?: string;
  request?: string;
  session?: boolean;
  context?: string;
}

export interface ParsedCommand {
  verb: string;
  positional: string[];
  flags: Record<string, string | boolean | undefined>;
}

export interface TaskMetadata {
  version: number;
  title: string;
  author: string;
  branch: string;
  base: string;
  small?: boolean;
  reviewCycle?: string;
}

export interface Task {
  file: string;
  content: string;
  metadata: TaskMetadata;
}

export interface ReviewFinding {
  severity: 'blocking' | 'should-fix' | 'nit';
  location: string;
  problem: string;
  suggestion: string;
}

export interface ReviewVerdict {
  verdict: 'pass' | 'blocked';
  standards: string;
  spec: string;
  findings: ReviewFinding[];
}

export interface ReviewRecord extends ReviewVerdict {
  reviewer: string;
  model: string;
  authorization: string | null;
  requestedModel: string;
  transport: string;
  author: string;
  tree: string;
  base: string;
  round: number;
  report?: string;
}

export interface RunningReview {
  id: string;
  ownerPid: number;
  reviewerPid: number | null | undefined;
  phase: string;
  startedAt: string;
}

export interface Receipt {
  tree: string;
  base?: string;
  command?: string[];
  at?: string;
}

export interface WorkflowState {
  revision: number;
  pass: Receipt | null;
  pending: { id: string; tree: string; at: number; session?: string } | null;
  approved: string | null;
  sessionAllowed?: string[];
  gate: string | null;
  first?: ReviewRecord;
  second?: ReviewRecord;
  extraReviews?: ReviewRecord[];
  running?: RunningReview | null;
  history?: { event: string; run: RunningReview; at: string }[];
  additionalReviewAuthorization?: unknown;
}

export interface CopyPlan {
  destination: string;
  files: string[];
}

export interface SettingsWrite {
  path: string;
  content: string;
  before: Buffer | null;
}

export interface LinkPlan {
  path: string;
  target: string;
}

export interface PackageStatus {
  path: string;
  matches: boolean;
  expected: string;
  actual?: string;
  error?: string;
}

export interface InstallOptions {
  repair?: boolean | undefined;
}

export interface InstallationPlan {
  source: string;
  writes: SettingsWrite[];
  copy?: CopyPlan | null | undefined;
  link?: LinkPlan | undefined;
  replace?: boolean | undefined;
}

export interface ProjectInstallPlan {
  root: string;
  writes: SettingsWrite[];
  link: LinkPlan | undefined;
  copy: CopyPlan | undefined;
  drift: PackageStatus | undefined;
  replace: boolean;
}

export interface PackageMetadata {
  name: string;
  version: string;
  files: string[];
  description: string;
}

export interface HarnessSettings {
  permissions?: unknown;
  hooks?: unknown;
  packages?: string[];
  extraKnownMarketplaces?: Record<string, { source: { source: string; path: string } }>;
  enabledPlugins?: Record<string, boolean>;
}

export interface MarketplacePlugin {
  name: string;
  source: { source: string; path: string };
  interface?: { displayName: string; shortDescription: string };
  policy?: { installation: string; authentication: string };
  category?: string;
}

export interface Marketplace {
  name: string;
  plugins: MarketplacePlugin[];
}

export interface Skill {
  name: string;
  description: string;
  file: string;
  content: string;
  bundled?: boolean;
}

export interface Extension {
  pre?: (input: Project & { action: Action }) => unknown | Promise<unknown>;
  post?: (input: Project & { action: Action }) => string | undefined | Promise<string | undefined>;
}

export interface SetupProject {
  path: string;
  stacks: string[];
  commands: { purpose: string; argv: string[]; evidence: string }[];
}

export interface PackedArchive {
  filename: string;
  files: { path: string; size: number; mode: number }[];
}

export interface NativeHookOutput {
  hookSpecificOutput?: {
    hookEventName?: string;
    permissionDecision?: string;
    permissionDecisionReason?: string;
    additionalContext?: string;
  };
}
