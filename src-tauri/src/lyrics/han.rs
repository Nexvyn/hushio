use std::collections::HashMap;
use std::sync::OnceLock;

const FROM: &str = "後於爲綫衆桜気戦麼麽鹼硷衞説氷";
const TO: &str = "后于为线众樱气战么么碱碱卫说冰";

fn table() -> &'static HashMap<char, char> {
    static TABLE: OnceLock<HashMap<char, char>> = OnceLock::new();
    TABLE.get_or_init(|| FROM.chars().zip(TO.chars()).collect())
}

pub fn fold_han(text: &str) -> String {
    text.chars()
        .map(|c| table().get(&c).copied().unwrap_or(c))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn fold_table_pairs_are_aligned() {
        assert_eq!(FROM.chars().count(), TO.chars().count());
    }

    #[test]
    fn traditional_forms_fold_to_simplified() {
        assert_eq!(fold_han("戦後説氷"), "战后说冰");
        assert_eq!(fold_han("麽麼"), "么么");
    }

    #[test]
    fn unlisted_characters_pass_through() {
        assert_eq!(fold_han("告白氣球"), "告白氣球");
    }
}
