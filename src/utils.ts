export function escapeRegex(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function buildTriggerRegex(trigger: string): RegExp {
    const escaped = escapeRegex(trigger);
    const first = escaped[0];
    return new RegExp(`${escaped}([^${first}\\s]*)$`);
}

export const URL_PATTERN = /^https?:\/\//i;
export const INTERNAL_LINK_PATTERN = /^\[\[.*\]\]$/;
