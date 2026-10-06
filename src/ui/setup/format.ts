/**
 * How the Setup screens (T2.9; boards `Setup-…`) write things, and the list's one-line
 * summaries. Pure, so they are tested apart from the screens.
 */

import {
  CONTAINER_ROLES,
  daysBetween,
  isListed,
  nextMaintenance,
  openClashes,
  type CoffeePack,
  type Container,
  type ContainerRole,
  type GrindSettingKind,
  type Grinder,
  type Machine,
  type MaintenanceItem,
  type MaintenanceKind,
  type MaintenanceStatus,
  type Recipe,
  type Tag,
} from '../../core/model';
import { recipeRatio } from '../brew/format';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** A date as the boards write it: `22 Sep`, with the year when it isn't today's: `22 Sep 2025`. */
export function dateLabel(date: string, today: string): string {
  const [year, month, day] = date.split('-');
  const label = `${Number(day)} ${MONTHS[Number(month) - 1]}`;
  return year === today.slice(0, 4) ? label : `${label} ${year}`;
}

/** Today's local date, `YYYY-MM-DD`. */
export function todayDate(now: Date = new Date()): string {
  const two = (n: number): string => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${two(now.getMonth() + 1)}-${two(now.getDate())}`;
}

/** The steppers' steps and limits. */
export const STEPS = {
  pressureBar: { step: 0.5, min: 1, max: 15, start: 9 },
  basketG: { step: 0.5, min: 5, max: 30, start: 18 },
  stepless: { step: 0.1, min: 0, max: 100, start: 5 },
  clicks: { step: 1, min: 0, max: 100, start: 20 },
  coffeeRatio: { step: 0.1, min: 1, max: 4, start: 2 },
  milkRatio: { step: 0.5, min: 0.5, max: 10, start: 3 },
} as const;

/** `value` moved by `steps` steps, within the limits, on the step's grid. */
export function stepped(
  value: number | null,
  steps: number,
  { step, min, max, start }: { step: number; min: number; max: number; start: number },
): number {
  const from = value ?? start - steps * step;
  const next = Math.round((from + steps * step) / step) * step;
  return Math.round(Math.min(max, Math.max(min, next)) * 100) / 100;
}

/** A pressure: `6.0 bar`. */
export function pressureLabel(bar: number): string {
  return `${bar.toFixed(1)} bar`;
}

/** A grinder's setting: one decimal when stepless, whole clicks; `–` when not set. */
export function settingLabel(kind: GrindSettingKind, value: number | null): string {
  if (value === null) return '–';
  return kind === 'clicks' ? String(Math.round(value)) : value.toFixed(1);
}

/** A grinder's kind as a word. */
export const SETTING_KIND_LABEL: Readonly<Record<GrindSettingKind, string>> = {
  stepless: 'Stepless',
  clicks: 'Clicks',
};

/** A container's roles as the boards name them. */
export const ROLE_LABEL: Readonly<Record<ContainerRole, string>> = {
  bean: 'Bean cup',
  grind: 'Grind cup',
  cup: 'Cup',
  milk: 'Milk jug',
  accessory: 'Scale accessory',
};

/**
 * The roles with `role` switched, in their order. A scale accessory has no other role (T2.17):
 * turning it on turns the others off, and turning another on turns it off.
 */
export function toggledRole(
  roles: readonly ContainerRole[],
  role: ContainerRole,
): readonly ContainerRole[] {
  if (roles.includes(role)) return roles.filter((r) => r !== role);
  if (role === 'accessory') return [role];
  return CONTAINER_ROLES.filter((r) => r === role || (roles.includes(r) && r !== 'accessory'));
}

/** A recipe's ratios, as the list writes them: `1:2 + milk 1:3`. */
export function recipeRatios(recipe: Pick<Recipe, 'coffeeRatio' | 'milkRatio'>): string {
  const milk = recipe.milkRatio === null ? '' : ` + milk ${recipeRatio(recipe.milkRatio)}`;
  return `${recipeRatio(recipe.coffeeRatio)}${milk}`;
}

/** A ratio in the editor's stepper: `1:2.0`. */
export function editorRatio(ratio: number): string {
  return `1:${ratio.toFixed(1)}`;
}

/** A pack's title (board Setup-Packs): its name before the first ` · `, as `Ethiopia Guji`. */
export function packTitle(pack: Pick<CoffeePack, 'name'>): string {
  const cut = pack.name.indexOf(' · ');
  return (cut === -1 ? pack.name : pack.name.slice(0, cut)) || 'Unnamed pack';
}

/** The rest of a pack's name, then its brand: `Natural · Local roaster`; null for neither. */
export function packSubtitle(pack: Pick<CoffeePack, 'name' | 'brand'>): string | null {
  const cut = pack.name.indexOf(' · ');
  const rest = cut === -1 ? '' : pack.name.slice(cut + 3);
  const parts = [rest, pack.brand ?? ''].filter((part) => part.trim() !== '');
  return parts.length === 0 ? null : parts.join(' · ');
}

/** Days off roast on `today`. */
export function daysOffRoast(pack: Pick<CoffeePack, 'roastDate'>, today: string): number {
  return daysBetween(pack.roastDate, today);
}

/** The packs as Setup-Packs groups them, each removed one left out. */
export interface PackGroups {
  /** Opened and not finished, the latest opened first. */
  readonly open: readonly CoffeePack[];
  /** Neither opened nor finished, the oldest roast first. */
  readonly unopened: readonly CoffeePack[];
  /** Finished, the latest first. */
  readonly finished: readonly CoffeePack[];
}

export function packGroups(packs: readonly CoffeePack[]): PackGroups {
  const listed = packs.filter(isListed);
  const later = (a: string | null, b: string | null): number => (b ?? '').localeCompare(a ?? '');
  return {
    open: listed
      .filter((p) => p.finishedDate === null && p.openDate !== null)
      .sort((a, b) => later(a.openDate, b.openDate)),
    unopened: listed
      .filter((p) => p.finishedDate === null && p.openDate === null)
      .sort((a, b) => a.roastDate.localeCompare(b.roastDate)),
    finished: listed
      .filter((p) => p.finishedDate !== null)
      .sort((a, b) => later(a.finishedDate, b.finishedDate)),
  };
}

/** Setup's row for the machine: `Gaggia Classic Pro · 6.0 bar · 3 baskets`. */
export function machineSummary(machine: Machine | null): string {
  if (machine === null) return 'None';
  const baskets = machine.baskets.length;
  return [
    machine.name || 'Unnamed machine',
    machine.pressureBar === null ? null : pressureLabel(machine.pressureBar),
    `${baskets} ${baskets === 1 ? 'basket' : 'baskets'}`,
  ]
    .filter((part) => part !== null)
    .join(' · ');
}

/** Setup's row for the grinders: the one in use and its setting, `ORO Mignon … (default) · 6.2`. */
export function grindersSummary(grinder: Grinder | null): string {
  if (grinder === null) return 'None';
  const setting =
    grinder.currentSetting === null
      ? ''
      : ` · ${settingLabel(grinder.settingKind, grinder.currentSetting)}`;
  return `${grinder.model || grinder.brand} (default)${setting}`;
}

/** Setup's row for the recipes: `7 · last: Cappuccino`. */
export function recipesSummary(recipes: readonly Recipe[], inUse: Recipe): string {
  return `${recipes.length} · last: ${inUse.name}`;
}

/** Setup's row for the packs: the one in use and its day, and how many wait unopened. */
export function packsSummary(
  packs: readonly CoffeePack[],
  inUse: CoffeePack | null,
  today: string,
): string {
  const groups = packGroups(packs);
  const current = inUse ?? groups.open[0] ?? null;
  // The pack in use may be unopened still; it isn't one of the others waiting.
  const unopened = groups.unopened.filter((pack) => pack.id !== current?.id).length;
  const parts = [
    current === null ? null : `${packTitle(current)} · day ${daysOffRoast(current, today)}`,
    unopened === 0 ? null : `${unopened} unopened`,
  ].filter((part) => part !== null);
  return parts.length === 0 ? 'None yet' : parts.join(' · ');
}

/** Setup's row for the containers: how many, and how many clashes to see. */
export function containersSummary(containers: readonly Container[]): {
  readonly count: string;
  readonly warnings: string | null;
} {
  const listed = containers.filter(isListed).length;
  const open = openClashes(containers).length;
  return {
    count: listed === 0 ? 'None yet' : String(listed),
    warnings: open === 0 ? null : `${open} ${open === 1 ? 'warning' : 'warnings'}`,
  };
}

/** Setup's row for the tags, `7 · 2 default`; the tags page says `7 tags · 2 default`. */
export function tagsSummary(tags: readonly Tag[], noun = false): string {
  const listed = tags.filter(isListed);
  const count = noun ? `${listed.length} ${listed.length === 1 ? 'tag' : 'tags'}` : listed.length;
  return `${count} · ${listed.filter((tag) => tag.isDefault).length} default`;
}

/** How many shots carry each tag, by its name in any case. */
export function tagShotCounts(
  shots: readonly { readonly tags: readonly string[] | null }[],
): ReadonlyMap<string, number> {
  const counts = new Map<string, number>();
  for (const shot of shots) {
    for (const tag of new Set((shot.tags ?? []).map((name) => name.toLocaleLowerCase()))) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return counts;
}

/** `n shots`, `1 shot`. */
export function shotCount(n: number): string {
  return n === 1 ? '1 shot' : `${n} shots`;
}

/** The maintenance dates as the boards name them. */
export const MAINTENANCE_LABEL: Readonly<Record<MaintenanceKind, string>> = {
  descale: 'Descale',
  backflush: 'Backflush',
  care: 'Grinder care',
};

/** A badge's words and colour. */
export interface Badge {
  readonly text: string;
  readonly tone: 'warn' | 'caution';
}

/**
 * A reminder's badge (boards Setup-Machine, Main): `4 days overdue` or `due today` (warn), `in 3
 * days` or `tomorrow` (caution) in the week before; none earlier, or without a reminder.
 */
export function maintenanceBadge(status: MaintenanceStatus): Badge | null {
  if (status.state === 'due') {
    const overdue = -status.daysLeft;
    const text =
      overdue === 0 ? 'due today' : `${overdue} ${overdue === 1 ? 'day' : 'days'} overdue`;
    return { text, tone: 'warn' };
  }
  if (status.state === 'soon') {
    return {
      text: status.daysLeft === 1 ? 'tomorrow' : `in ${status.daysLeft} days`,
      tone: 'caution',
    };
  }
  return null;
}

/** `Reminder every 60 days`; `No reminder`. */
export function reminderText(days: number | null): string {
  if (days === null) return 'No reminder';
  return days === 1 ? 'Reminder every day' : `Reminder every ${days} days`;
}

/** The reminder's stepper goes through these intervals, days. */
export const REMINDER_DAYS: readonly number[] = [7, 14, 21, 30, 45, 60, 90, 120, 180, 365];

/**
 * The interval `steps` along `REMINDER_DAYS` from `days`: from none, 30 days; one off the list
 * (an import) moves to the next one on the list that way.
 */
export function steppedReminder(days: number | null, steps: number): number {
  if (days === null) return 30;
  // Where it sits on the list: off it, half a step from the ones either side.
  const above = REMINDER_DAYS.findIndex((d) => d >= days);
  const position =
    above === -1 ? REMINDER_DAYS.length - 0.5 : REMINDER_DAYS[above] === days ? above : above - 0.5;
  const index = steps > 0 ? Math.floor(position + steps) : Math.ceil(position + steps);
  return REMINDER_DAYS[Math.min(REMINDER_DAYS.length - 1, Math.max(0, index))];
}

/**
 * Setup's row for the maintenance (board Setup): what comes due next, `Descale overdue` (warn) or
 * `Backflush in 3 days` (caution); `Descale in 40 days` further off; `No reminders` without any.
 */
export function maintenanceSummary(items: readonly MaintenanceItem[]): {
  readonly text: string;
  readonly tone: 'warn' | 'caution' | null;
} {
  const next = nextMaintenance(items);
  if (next === null || next.status.state === 'none') return { text: 'No reminders', tone: null };
  const label = MAINTENANCE_LABEL[next.kind];
  const { state, daysLeft } = next.status;
  if (state === 'due') {
    return { text: daysLeft === 0 ? `${label} due today` : `${label} overdue`, tone: 'warn' };
  }
  const when = daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;
  return { text: `${label} ${when}`, tone: state === 'soon' ? 'caution' : null };
}
