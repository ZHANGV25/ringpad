# Third-party files

## vb-cable

[VB-CABLE](https://vb-audio.com/Cable/) by VB-Audio Software (Vincent Burel): the virtual audio
cable Ringpad installs when a PC has none. **VB-CABLE is a donationware, all participations are
welcome** (www.vb-cable.com).

It is not covered by Ringpad's MIT license. VB-Audio allows shipping the standard VB-CABLE package
with other apps, including a silent install, as long as people can see it is VB-Audio's software
and can donate: <https://vb-audio.com/Services/licensing.htm>. Ringpad names VB-Audio and links to
vb-cable.com wherever it offers the install, and in Settings > About.

`vb-cable/` is `VBCABLE_Driver_Pack45.zip` unzipped, with nothing changed:

- Source: <https://download.vb-audio.com/Download_CABLE/VBCABLE_Driver_Pack45.zip>
- Zip SHA-256: `b950e39f01af1d04ea623c8f6d8eb9b6ea5c477c637295fabf20631c85116bfb`
- Driver 3.3.1.7 (Oct 2024). The Windows 10/11 catalog `vbaudio_cable64_win10.cat` is signed by
  Microsoft Windows Hardware Compatibility Publisher.

The installer bundles the whole folder as `vbcable/`. Ringpad runs `VBCABLE_Setup_x64.exe -i -h`
elevated when the user asks for it; Windows still shows its own driver prompt. Uninstalling Ringpad
leaves VB-CABLE in place, since removing a driver needs a restart. VB-CABLE's own setup removes it.

To update: download the new pack from <https://vb-audio.com/Cable/>, replace the folder's contents
with the unzipped files, and update the hash and version above. `.gitattributes` keeps git from
touching line endings, which would break the catalog signature.
