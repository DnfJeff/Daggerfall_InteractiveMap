// Daggerfall Interactive Map desktop app: one executable with the web app embedded in it, shown in the
// system WebView2 (built into Windows 10/11). No server, no browser window, nothing to install.
// The webview's storage (notes, settings, remembered folders) lives in `data/` beside the .exe,
// so the program and its notes stay together and the folder is portable.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use tauri::{WebviewUrl, WebviewWindowBuilder};

fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let exe_dir = std::env::current_exe()?
                .parent()
                .map(|p| p.to_path_buf())
                .unwrap_or_default();
            WebviewWindowBuilder::new(app, "main", WebviewUrl::default())
                .title("Daggerfall Interactive Map")
                .inner_size(1600.0, 960.0)
                .min_inner_size(900.0, 600.0)
                .data_directory(exe_dir.join("data"))
                .build()?;
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running Daggerfall Interactive Map");
}
