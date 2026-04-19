use nf_publish::run_cli;

fn main() {
    match run_cli(std::env::args()) {
        Ok(preview) => {
            let output = serde_json::to_string_pretty(&preview)
                .unwrap_or_else(|_| "{\"ok\":false}".to_string());
            println!("{output}");
        }
        Err(err) => {
            eprintln!("{err}");
            std::process::exit(1);
        }
    }
}
