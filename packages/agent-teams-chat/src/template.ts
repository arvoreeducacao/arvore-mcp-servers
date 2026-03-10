const HANDLEBARS_REGEX = /\{\{(\w+)\}\}/g;

export function renderTemplate(
  template: string,
  vars: Record<string, string>,
): string {
  return template.replace(HANDLEBARS_REGEX, (_, key: string) => {
    return vars[key] ?? `{{${key}}}`;
  });
}
