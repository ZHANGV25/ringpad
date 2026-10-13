//! Lists the apps that have each microphone open, and whether they record from it now.

#[cfg(windows)]
fn main() -> Result<(), Box<dyn std::error::Error>> {
    use ringpad_windows::devices::list_devices;
    use ringpad_windows::sessions::apps_using_device;
    use ringpad_windows::DeviceDirection;

    for device in list_devices()?
        .into_iter()
        .filter(|device| device.direction == DeviceDirection::Input)
    {
        println!("{}", device.name);
        for app in apps_using_device(&device.id)? {
            println!(
                "  {} ({}) pid {} active={}",
                app.display_name, app.exe_name, app.pid, app.active
            );
        }
    }
    Ok(())
}

#[cfg(not(windows))]
fn main() {}
