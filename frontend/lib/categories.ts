import type { Category } from "./api";

const copy: Record<string, { title: string; description: string }> = {
  "globuri-de-craciun": {
    title: "Globuri de Crăciun personalizate prin caligrafie",
    description: "Globuri din sticlă și ornamente din ceramică, personalizate manual cu nume, inițiale sau cuvinte. Alege forma și verifică opțiunile fiecărui produs.",
  },
  "scrisori": {
    title: "Scrisori personalizate, caligrafiate de mână",
    description: "Un mesaj personal, scris de mână. Descoperă scrisorile din atelier și alege produsul potrivit pentru textul și ocazia ta.",
  },
  "semne-de-carte": {
    title: "Semne de carte personalizate prin caligrafie",
    description: "Un cadou pentru cei care iubesc lectura: semne de carte personalizate prin caligrafie manuală. Vezi detaliile și opțiunile disponibile.",
  },
  "tablouri": {
    title: "Tablouri personalizate prin caligrafie",
    description: "Nume și mesaje așternute de mână, pentru un cadou personal. Compară formatele și verifică detaliile de personalizare ale fiecărui tablou.",
  },
  "martisor": {
    title: "Mărțișoare personalizate prin caligrafie",
    description: "Mărțișoare cu mesaje scrise de mână, pentru un dar de primăvară. Descoperă modelele din atelier și opțiunile lor de personalizare.",
  },
};

export function categoryCopy(category: Category) {
  const defaults = copy[category.slug];
  return {
    title: defaults?.title || `${category.name} — cadouri personalizate`,
    description: category.description || defaults?.description || `Descoperă colecția ${category.name} din atelierul Ave Letter Studio. Vezi prețurile, opțiunile de personalizare și timpul de producție pentru fiecare produs.`,
  };
}
