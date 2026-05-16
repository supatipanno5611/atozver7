export type FrontmatterRecord = Record<string, unknown>;

export const PERSON_PROPERTIES = ['teacher', 'translator', 'questioner', 'writer'] as const;
type PersonProperty = typeof PERSON_PROPERTIES[number];

export interface PropertyIssue {
    path: string;
    property: string;
    message: string;
}

function hasMeaningfulValue(value: unknown): boolean {
    if (value === null || value === undefined || value === '') return false;
    return Array.isArray(value) ? value.length > 0 : true;
}

function hasNonEmptyPersonProperty(fm: FrontmatterRecord, property: PersonProperty): boolean {
    const value = fm[property];
    return Array.isArray(value) ? value.length > 0 : hasMeaningfulValue(value);
}

export function validatePropertyState(fm: FrontmatterRecord, path: string): PropertyIssue[] {
    const issues: PropertyIssue[] = [];

    for (const property of PERSON_PROPERTIES) {
        const value = fm[property];
        if (value === undefined) continue;

        if (!Array.isArray(value)) {
            issues.push({
                path,
                property,
                message: `${property}는 배열이어야 합니다.`,
            });
            continue;
        }

        if (value.some((item) => typeof item !== 'string')) {
            issues.push({
                path,
                property,
                message: `${property}에는 문자열만 넣을 수 있습니다.`,
            });
        }
    }

    const hasTeacher = hasNonEmptyPersonProperty(fm, 'teacher');
    const hasTranslator = hasNonEmptyPersonProperty(fm, 'translator');
    const hasQuestioner = hasNonEmptyPersonProperty(fm, 'questioner');
    const hasWriter = hasNonEmptyPersonProperty(fm, 'writer');
    const hasDesana = hasTeacher || hasTranslator || hasQuestioner;

    if (hasTeacher && !hasTranslator) {
        issues.push({
            path,
            property: 'translator',
            message: 'teacher가 있으면 translator도 있어야 합니다.',
        });
    }

    if (hasTranslator && !hasTeacher) {
        issues.push({
            path,
            property: 'teacher',
            message: 'translator가 있으면 teacher도 있어야 합니다.',
        });
    }

    if (hasQuestioner && (!hasTeacher || !hasTranslator)) {
        issues.push({
            path,
            property: 'questioner',
            message: 'questioner는 teacher와 translator가 함께 있을 때만 사용할 수 있습니다.',
        });
    }

    if (hasWriter && hasDesana) {
        issues.push({
            path,
            property: 'writer',
            message: 'writer는 teacher, translator, questioner와 함께 사용할 수 없습니다.',
        });
    }

    return issues;
}
