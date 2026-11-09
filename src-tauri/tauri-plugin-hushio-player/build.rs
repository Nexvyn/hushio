const COMMANDS: &[&str] = &[
    "player_set_queue",
    "player_append",
    "player_insert_next",
    "player_remove_at",
    "player_move",
    "player_play",
    "player_pause",
    "player_toggle",
    "player_next",
    "player_previous",
    "player_seek",
    "player_set_speed",
    "player_set_volume",
    "player_set_repeat",
    "player_set_shuffle",
    "player_set_skip_silence",
    "player_set_eq",
    "player_set_sleep_timer",
    "player_set_url",
    "player_set_like",
    "player_get_state",
    "registerListener",
    "removeListener",
];

fn main() {
    tauri_plugin::Builder::new(COMMANDS)
        .android_path("android")
        .build();
}
