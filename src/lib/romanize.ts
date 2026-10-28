const HAN = /\p{Script=Han}/u;
const HANGUL_RUN = /[가-힣]+/g;
const KANA_RUN = /[ぁ-ゖァ-ヺー]+/g;
const CYRILLIC_RUN = /[Ѐ-ӿ]+/g;
const INDIC_RUN = /[ऀ-ൿ]+/g;

const HANGUL_INITIALS = ["g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s", "ss", "", "j", "jj", "ch", "k", "t", "p", "h"];
const HANGUL_VOWELS = [
  "a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa", "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i",
];
const HANGUL_FINALS = [
  "", "k", "k", "k", "n", "n", "n", "t", "l", "k", "m", "p", "l", "l", "p", "l", "m", "p", "p", "t", "t", "ng", "t", "t", "k", "t", "p", "t",
];
const HANGUL_LIAISON: Record<number, string> = {
  1: "g", 2: "kk", 4: "n", 7: "d", 8: "r", 16: "m", 17: "b", 19: "s", 20: "ss", 21: "ng", 22: "j", 23: "ch", 24: "k", 25: "t", 26: "p",
};
const HANGUL_SILENT_INITIAL = 11;

const KANA: Record<string, string> = {
  あ: "a", い: "i", う: "u", え: "e", お: "o",
  か: "ka", き: "ki", く: "ku", け: "ke", こ: "ko",
  さ: "sa", し: "shi", す: "su", せ: "se", そ: "so",
  た: "ta", ち: "chi", つ: "tsu", て: "te", と: "to",
  な: "na", に: "ni", ぬ: "nu", ね: "ne", の: "no",
  は: "ha", ひ: "hi", ふ: "fu", へ: "he", ほ: "ho",
  ま: "ma", み: "mi", む: "mu", め: "me", も: "mo",
  や: "ya", ゆ: "yu", よ: "yo",
  ら: "ra", り: "ri", る: "ru", れ: "re", ろ: "ro",
  わ: "wa", を: "o", ん: "n",
  が: "ga", ぎ: "gi", ぐ: "gu", げ: "ge", ご: "go",
  ざ: "za", じ: "ji", ず: "zu", ぜ: "ze", ぞ: "zo",
  だ: "da", ぢ: "ji", づ: "zu", で: "de", ど: "do",
  ば: "ba", び: "bi", ぶ: "bu", べ: "be", ぼ: "bo",
  ぱ: "pa", ぴ: "pi", ぷ: "pu", ぺ: "pe", ぽ: "po",
  ゔ: "vu",
  ぁ: "a", ぃ: "i", ぅ: "u", ぇ: "e", ぉ: "o",
};
const SMALL_YOU: Record<string, string> = { ゃ: "ya", ゅ: "yu", ょ: "yo" };
const SIBILANT_STEM = /(?:sh|ch|j)$/;
const KANA_CONSONANT_START = /^(?:[bcdfghjklmnpqrstvwxyz])/;

const CYRILLIC: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "yo", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "kh", ц: "ts", ч: "ch", ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

const INDIC_CONSONANTS = [
  "ka", "kha", "ga", "gha", "nga", "cha", "chha", "ja", "jha", "nya",
  "ta", "tha", "da", "dha", "na", "ta", "tha", "da", "dha", "na", "na",
  "pa", "pha", "ba", "bha", "ma", "ya", "ra", "ra", "la", "la", "la", "va", "sha", "sha", "sa", "ha",
];
const INDIC_INDEPENDENT_VOWELS: Record<number, string> = {
  0x05: "a", 0x06: "aa", 0x07: "i", 0x08: "ii", 0x09: "u", 0x0a: "uu", 0x0b: "ri", 0x0f: "e", 0x10: "ai", 0x12: "o", 0x13: "au",
};
const INDIC_VOWEL_SIGNS: Record<number, string> = {
  0x3e: "aa", 0x3f: "i", 0x40: "ii", 0x41: "u", 0x42: "uu", 0x43: "ri", 0x47: "e", 0x48: "ai", 0x4b: "o", 0x4c: "au",
};
const INDIC_VIRAMA = 0x4d;
const INDIC_CONSONANT_FIRST = 0x15;
const INDIC_CONSONANT_LAST = 0x39;
const INDIC_BLOCK_START = 0x0900;
const INDIC_BLOCK_SIZE = 0x80;

function capitalizeLike(source: string, target: string): string {
  return source !== source.toLowerCase() ? target.charAt(0).toUpperCase() + target.slice(1) : target;
}

function romanizeHangul(text: string): string {
  return text.replace(HANGUL_RUN, (run) => {
    const syllables = [...run].map((char) => {
      const offset = char.codePointAt(0)! - 0xac00;
      return {
        lead: Math.floor(offset / 588),
        vowel: Math.floor((offset % 588) / 28),
        tail: offset % 28,
      };
    });
    const liaison = (index: number) =>
      index > 0 &&
      index < syllables.length &&
      syllables[index].lead === HANGUL_SILENT_INITIAL &&
      syllables[index - 1].tail > 0;
    return syllables
      .map((syllable, index) => {
        const initial = liaison(index)
          ? (HANGUL_LIAISON[syllables[index - 1].tail] ?? HANGUL_FINALS[syllables[index - 1].tail])
          : HANGUL_INITIALS[syllable.lead];
        const final = liaison(index + 1) ? "" : HANGUL_FINALS[syllable.tail];
        return initial + HANGUL_VOWELS[syllable.vowel] + final;
      })
      .join("");
  });
}

function katakanaToHiragana(char: string): string {
  const code = char.codePointAt(0)!;
  return code >= 0x30a1 && code <= 0x30f6 ? String.fromCodePoint(code - 0x60) : char;
}

function kanaRomaji(run: string): string {
  const tokens: string[] = [];
  let doubling = false;
  for (const raw of run) {
    const char = katakanaToHiragana(raw);
    if (char === "っ") {
      doubling = true;
      continue;
    }
    if (char === "ー") {
      const last = tokens.at(-1)?.at(-1) ?? "";
      if ("aeiou".includes(last)) tokens.push(last);
      continue;
    }
    const youon = SMALL_YOU[char];
    let token: string;
    if (youon && tokens.length > 0) {
      const stem = tokens.pop()!.replace(/i$/, "");
      token = stem + (SIBILANT_STEM.test(stem) ? youon.slice(1) : youon);
    } else {
      token = KANA[char] ?? raw;
    }
    if (doubling && KANA_CONSONANT_START.test(token)) {
      token = (token.startsWith("ch") ? "t" : token.charAt(0)) + token;
    }
    doubling = false;
    tokens.push(token);
  }
  return tokens.join("");
}

function romanizeKana(text: string): string {
  return text.replace(KANA_RUN, kanaRomaji);
}

function romanizeCyrillic(text: string): string {
  return text.replace(CYRILLIC_RUN, (run) =>
    [...run]
      .map((char) => {
        const lower = char.toLowerCase();
        const latin = CYRILLIC[lower];
        return latin === undefined ? char : capitalizeLike(char, latin);
      })
      .join(""),
  );
}

function indicRun(run: string): string {
  const chars = [...run];
  const offsetOf = (char: string) => (char.codePointAt(0)! - INDIC_BLOCK_START) % INDIC_BLOCK_SIZE;
  let out = "";
  for (let index = 0; index < chars.length; index++) {
    const offset = offsetOf(chars[index]);
    const next = chars[index + 1] === undefined ? undefined : offsetOf(chars[index + 1]);
    if (offset >= INDIC_CONSONANT_FIRST && offset <= INDIC_CONSONANT_LAST) {
      const bare = INDIC_CONSONANTS[offset - INDIC_CONSONANT_FIRST].slice(0, -1);
      if (next === INDIC_VIRAMA) {
        out += bare;
        index++;
      } else if (next !== undefined && INDIC_VOWEL_SIGNS[next] !== undefined) {
        out += bare + INDIC_VOWEL_SIGNS[next];
        index++;
      } else {
        out += next === undefined ? bare : INDIC_CONSONANTS[offset - INDIC_CONSONANT_FIRST];
      }
    } else if (INDIC_INDEPENDENT_VOWELS[offset] !== undefined) {
      out += INDIC_INDEPENDENT_VOWELS[offset];
    } else if (offset === 0x01 || offset === 0x02) {
      out += "n";
    } else if (offset === 0x03) {
      out += "h";
    } else if (offset === INDIC_VIRAMA || INDIC_VOWEL_SIGNS[offset] !== undefined) {
      continue;
    } else {
      out += chars[index];
    }
  }
  return out;
}

function romanizeIndic(text: string): string {
  return text.replace(INDIC_RUN, indicRun);
}

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function romanize(line: string): string | null {
  if (HAN.test(line)) return null;
  const source = collapse(line);
  if (source === "") return null;
  const result = collapse(romanizeIndic(romanizeCyrillic(romanizeKana(romanizeHangul(source)))));
  return result === source ? null : result;
}
