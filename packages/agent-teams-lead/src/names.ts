const FIRST_NAMES = [
  "Sofia", "Lucas", "Marina", "Pedro", "Clara",
  "Rafael", "Beatriz", "Gabriel", "Laura", "Mateus",
  "Helena", "Thiago", "Camila", "André", "Isabela",
  "Diego", "Valentina", "Bruno", "Alice", "Caio",
  "Luana", "Felipe", "Manuela", "Gustavo", "Lívia",
  "Renato", "Júlia", "Vinícius", "Letícia", "Henrique",
];

const usedNames = new Set<string>();

export function generateTeammateName(): string {
  const available = FIRST_NAMES.filter((n) => !usedNames.has(n));

  if (available.length === 0) {
    usedNames.clear();
    return generateTeammateName();
  }

  const name = available[Math.floor(Math.random() * available.length)];
  usedNames.add(name);
  return name;
}

export function resetNames(): void {
  usedNames.clear();
}
