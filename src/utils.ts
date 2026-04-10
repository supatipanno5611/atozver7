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
export const DATE_PATTERN = /^\d{4}년$|^\d{1,2}월$|^\d{1,2}일$/;

export function sortBase(base: unknown[]): void {
    const isKorean = (s: string) => /[가-힣]/.test(s);
    const isLink = (s: string) => URL_PATTERN.test(s) || INTERNAL_LINK_PATTERN.test(s);
    const isDate = (s: string) => DATE_PATTERN.test(s);

    const dateOrder = (v: string) => {
        if (/^\d{4}년$/.test(v)) return 0;
        if (/^\d{1,2}월$/.test(v)) return 1;
        if (/^\d{1,2}일$/.test(v)) return 2;
        return 3;
    };

    const groupOf = (v: string) => {
        if (isDate(v)) return 0;
        if (isLink(v)) return 2;
        return 1;
    };

    base.sort((a, b) => {
        const aStr = String(a);
        const bStr = String(b);
        const gA = groupOf(aStr);
        const gB = groupOf(bStr);

        if (gA !== gB) return gA - gB;

        if (gA === 0) return dateOrder(aStr) - dateOrder(bStr);

        const aKo = isKorean(aStr);
        const bKo = isKorean(bStr);
        if (aKo !== bKo) return aKo ? 1 : -1;
        return aStr.localeCompare(bStr);
    });
}
