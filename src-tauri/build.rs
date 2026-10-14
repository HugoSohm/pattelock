fn main() {
    // Sous Windows, l'icône de l'app est intégrée à l'exécutable par tauri-build : on
    // recompile cette ressource dès qu'une icône change (sinon l'ancienne reste).
    println!("cargo:rerun-if-changed=icons");
    tauri_build::build()
}
