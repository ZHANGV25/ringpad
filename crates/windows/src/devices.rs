//! Device enumeration and pure device-picking rules.

use thiserror::Error;

/// Audio endpoint direction used by Ringpad.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DeviceDirection {
    /// Playback endpoint.
    Output,
    /// Capture endpoint.
    Input,
}

/// Known virtual-cable families.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum VirtualCable {
    /// VB-Audio Virtual Cable.
    VbCable,
    /// Voicemod virtual device.
    Voicemod,
    /// VB-Audio VoiceMeeter virtual device.
    VoiceMeeter,
    /// Other virtual device.
    Other,
}

/// User-visible audio endpoint metadata.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct DeviceInfo {
    /// Stable Windows endpoint id.
    pub id: String,
    /// Friendly endpoint name.
    pub name: String,
    /// Input or output direction.
    pub direction: DeviceDirection,
    /// Whether this is the default endpoint for its direction.
    pub is_default: bool,
    /// Virtual-cable classification, if recognized.
    pub virtual_cable: Option<VirtualCable>,
}

/// Errors from device-picking rules.
#[derive(Debug, Error, Clone, PartialEq, Eq)]
pub enum DevicePickError {
    /// No usable virtual cable output was found.
    #[error("no virtual cable output device was found")]
    NoVirtualCable,
    /// A saved microphone points at a virtual device.
    #[error("saved microphone '{0}' is a virtual device")]
    SavedMicIsVirtual(String),
    /// The chosen headphone output is virtual and would loop clips back.
    #[error("headphones '{0}' are virtual")]
    HeadphonesAreVirtual(String),
    /// No non-virtual output device was found for headphones.
    #[error("no non-virtual headphone output device was found")]
    NoHeadphones,
    /// A saved device id exists but has the wrong direction.
    #[error("saved device '{0}' has the wrong direction")]
    WrongDirection(String),
}

/// Classifies a friendly device name as a known virtual-cable family.
#[must_use]
pub fn classify_device_name(name: &str) -> Option<VirtualCable> {
    let lower = name.to_ascii_lowercase();
    if lower.contains("cable input")
        || lower.contains("cable output")
        || lower.contains("vb-audio virtual cable")
    {
        Some(VirtualCable::VbCable)
    } else if lower.contains("voicemod") {
        Some(VirtualCable::Voicemod)
    } else if lower.contains("voicemeeter") || lower.contains("vb-audio voicemeeter") {
        Some(VirtualCable::VoiceMeeter)
    } else {
        None
    }
}

/// Lists active playback and capture devices.
#[cfg(windows)]
pub fn list_devices() -> Result<Vec<DeviceInfo>, crate::BackendError> {
    use wasapi::{DeviceEnumerator, Direction};

    // COM may already be initialised on this thread (for example as STA on a UI thread);
    // device and session enumeration work either way, so the result is ignored.
    let _ = wasapi::initialize_mta();
    let enumerator = DeviceEnumerator::new().map_err(crate::BackendError::from_wasapi)?;
    let default_output = default_id(&enumerator, &Direction::Render);
    let default_input = default_id(&enumerator, &Direction::Capture);
    let mut devices = Vec::new();
    append_devices(
        &enumerator,
        Direction::Render,
        DeviceDirection::Output,
        default_output.as_deref(),
        &mut devices,
    )?;
    append_devices(
        &enumerator,
        Direction::Capture,
        DeviceDirection::Input,
        default_input.as_deref(),
        &mut devices,
    )?;
    Ok(devices)
}

/// Lists active playback and capture devices.
#[cfg(not(windows))]
pub fn list_devices() -> Result<Vec<DeviceInfo>, crate::BackendError> {
    Ok(Vec::new())
}

#[cfg(windows)]
fn default_id(
    enumerator: &wasapi::DeviceEnumerator,
    direction: &wasapi::Direction,
) -> Option<String> {
    enumerator
        .get_default_device(direction)
        .and_then(|device| device.get_id())
        .ok()
}

#[cfg(windows)]
fn append_devices(
    enumerator: &wasapi::DeviceEnumerator,
    wasapi_direction: wasapi::Direction,
    direction: DeviceDirection,
    default_id: Option<&str>,
    out: &mut Vec<DeviceInfo>,
) -> Result<(), crate::BackendError> {
    let collection = enumerator
        .get_device_collection(&wasapi_direction)
        .map_err(crate::BackendError::from_wasapi)?;
    for device in &collection {
        let device = device.map_err(crate::BackendError::from_wasapi)?;
        let id = device.get_id().map_err(crate::BackendError::from_wasapi)?;
        let name = device
            .get_friendlyname()
            .map_err(crate::BackendError::from_wasapi)?;
        out.push(DeviceInfo {
            is_default: default_id == Some(id.as_str()),
            virtual_cable: classify_device_name(&name),
            id,
            name,
            direction,
        });
    }
    Ok(())
}

/// Picks the virtual output used as Ringpad's virtual microphone render endpoint.
pub fn pick_virtual_output(
    devices: &[DeviceInfo],
    saved_id: Option<&str>,
) -> Result<DeviceInfo, DevicePickError> {
    if let Some(saved) = saved_id.and_then(|id| devices.iter().find(|device| device.id == id)) {
        if saved.direction != DeviceDirection::Output {
            return Err(DevicePickError::WrongDirection(saved.id.clone()));
        }
        if saved.virtual_cable.is_some() {
            return Ok(saved.clone());
        }
    }
    devices
        .iter()
        .filter(|device| device.direction == DeviceDirection::Output)
        .filter_map(|device| virtual_output_rank(device).map(|rank| (rank, device)))
        .min_by_key(|(rank, _device)| *rank)
        .map(|(_rank, device)| device.clone())
        .ok_or(DevicePickError::NoVirtualCable)
}

/// Picks the optional real microphone input.
pub fn pick_mic(
    devices: &[DeviceInfo],
    saved_id: Option<&str>,
) -> Result<Option<DeviceInfo>, DevicePickError> {
    if let Some(saved) = saved_id.and_then(|id| devices.iter().find(|device| device.id == id)) {
        if saved.direction != DeviceDirection::Input {
            return Err(DevicePickError::WrongDirection(saved.id.clone()));
        }
        if saved.virtual_cable.is_some() {
            return Err(DevicePickError::SavedMicIsVirtual(saved.name.clone()));
        }
        return Ok(Some(saved.clone()));
    }
    if let Some(default) = devices
        .iter()
        .find(|device| device.direction == DeviceDirection::Input && device.is_default)
    {
        if default.virtual_cable.is_none() {
            return Ok(Some(default.clone()));
        }
    }
    Ok(devices
        .iter()
        .find(|device| device.direction == DeviceDirection::Input && device.virtual_cable.is_none())
        .cloned())
}

/// Picks the headphone output.
pub fn pick_headphones(
    devices: &[DeviceInfo],
    saved_id: Option<&str>,
) -> Result<DeviceInfo, DevicePickError> {
    let picked = saved_id
        .and_then(|id| devices.iter().find(|device| device.id == id))
        .or_else(|| {
            devices
                .iter()
                .find(|device| device.direction == DeviceDirection::Output && device.is_default)
        });
    let Some(device) = picked else {
        return Err(DevicePickError::NoHeadphones);
    };
    if device.direction != DeviceDirection::Output {
        return Err(DevicePickError::WrongDirection(device.id.clone()));
    }
    if device.virtual_cable.is_some() {
        return Err(DevicePickError::HeadphonesAreVirtual(device.name.clone()));
    }
    Ok(device.clone())
}

/// Returns the capture-side virtual cable endpoint users should choose in games.
#[must_use]
pub fn matching_capture_side(
    virtual_output: &DeviceInfo,
    devices: &[DeviceInfo],
) -> Option<DeviceInfo> {
    match virtual_output.virtual_cable {
        Some(VirtualCable::VbCable) => find_input(devices, |name| name.contains("cable output")),
        Some(VirtualCable::Voicemod) => find_input(devices, |name| {
            name.contains("microphone") && name.contains("voicemod")
        }),
        Some(VirtualCable::VoiceMeeter) => find_input(devices, |name| {
            name.contains("voicemeeter") && name.contains("output")
        }),
        _ => None,
    }
}

fn virtual_output_rank(device: &DeviceInfo) -> Option<u8> {
    let lower = device.name.to_ascii_lowercase();
    match device.virtual_cable {
        Some(VirtualCable::VbCable) if lower.contains("cable input") => Some(0),
        Some(VirtualCable::VbCable) => Some(1),
        Some(VirtualCable::Voicemod) if lower.contains("line") => Some(2),
        Some(VirtualCable::Voicemod) => Some(3),
        Some(VirtualCable::VoiceMeeter) if lower.contains("input") => Some(4),
        Some(VirtualCable::VoiceMeeter) => Some(5),
        Some(VirtualCable::Other) => Some(6),
        None => None,
    }
}

fn find_input(devices: &[DeviceInfo], matches: impl Fn(&str) -> bool) -> Option<DeviceInfo> {
    devices
        .iter()
        .find(|device| {
            device.direction == DeviceDirection::Input && matches(&device.name.to_ascii_lowercase())
        })
        .cloned()
}
