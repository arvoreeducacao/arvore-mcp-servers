export function stripJidSuffix(jid: string): string {
  return jid
    .replace(/@s\.whatsapp\.net$/, "")
    .replace(/@lid$/, "")
    .replace(/@c\.us$/, "")
    .split(":")[0];
}

export function expandBrMobileVariants(digits: string): string[] {
  const variants = new Set<string>();
  variants.add(digits);

  const brMobileWithNine = /^55(\d{2})9(\d{8})$/;
  const brMobileWithoutNine = /^55(\d{2})(\d{8})$/;

  const withNine = brMobileWithNine.exec(digits);
  if (withNine) {
    variants.add(`55${withNine[1]}${withNine[2]}`);
    return [...variants];
  }

  const withoutNine = brMobileWithoutNine.exec(digits);
  if (withoutNine) {
    variants.add(`55${withoutNine[1]}9${withoutNine[2]}`);
  }

  return [...variants];
}

export function normalizePhone(input: string): string {
  return input.replace(/\D/g, "");
}

export function toJid(input: string): string {
  if (input.endsWith("@s.whatsapp.net") || input.endsWith("@lid") || input.endsWith("@g.us") || input.endsWith("@newsletter")) {
    return input;
  }
  const digits = normalizePhone(input);
  if (!digits) {
    throw new Error(`Invalid phone or JID: ${input}`);
  }
  return `${digits}@s.whatsapp.net`;
}
