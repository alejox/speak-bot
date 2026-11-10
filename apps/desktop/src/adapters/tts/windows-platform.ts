import type { AudioDevice, Voice } from "@speed-deck/core";
import { readCommandOutput, type CommandSpec } from "./command-runner";
import type { SpeechPlatform } from "./process-speech-synthesizer";

// The scripts below are constants. Every user value (text, voice, rate, device) is read from
// environment variables inside PowerShell, so nothing the user types becomes script code.

const AWAIT_HELPER = `
Add-Type -AssemblyName System.Runtime.WindowsRuntime
$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
})[0]
function Await($operation, [Type]$resultType) {
  $task = $asTaskGeneric.MakeGenericMethod($resultType).Invoke($null, @($operation))
  $task.Wait(-1) | Out-Null
  $task.Result
}
[Windows.Devices.Enumeration.DeviceInformation, Windows.Devices.Enumeration, ContentType = WindowsRuntime] | Out-Null
[Windows.Media.Devices.MediaDevice, Windows.Media.Devices, ContentType = WindowsRuntime] | Out-Null
`;

const SPEAK_SCRIPT = `
$ErrorActionPreference = 'Stop'
$text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($env:SPEED_DECK_TEXT))
$rate = [double]::Parse($env:SPEED_DECK_RATE, [Globalization.CultureInfo]::InvariantCulture)
if ($env:SPEED_DECK_DEVICE) {
  # WinRT path: synthesize to a stream and play it on the chosen render device.
  ${AWAIT_HELPER}
  [Windows.Media.SpeechSynthesis.SpeechSynthesizer, Windows.Media.SpeechSynthesis, ContentType = WindowsRuntime] | Out-Null
  [Windows.Media.Playback.MediaPlayer, Windows.Media.Playback, ContentType = WindowsRuntime] | Out-Null
  [Windows.Media.Core.MediaSource, Windows.Media.Core, ContentType = WindowsRuntime] | Out-Null
  $synth = New-Object Windows.Media.SpeechSynthesis.SpeechSynthesizer
  if ($env:SPEED_DECK_VOICE) {
    $voice = [Windows.Media.SpeechSynthesis.SpeechSynthesizer]::AllVoices |
      Where-Object { $env:SPEED_DECK_VOICE.StartsWith($_.DisplayName) } | Select-Object -First 1
    if ($voice) { $synth.Voice = $voice }
  }
  $synth.Options.SpeakingRate = [Math]::Max(0.5, [Math]::Min(6.0, $rate))
  $stream = Await ($synth.SynthesizeTextToStreamAsync($text)) ([Windows.Media.SpeechSynthesis.SpeechSynthesisStream])
  $device = Await ([Windows.Devices.Enumeration.DeviceInformation]::CreateFromIdAsync($env:SPEED_DECK_DEVICE)) ([Windows.Devices.Enumeration.DeviceInformation])
  $player = New-Object Windows.Media.Playback.MediaPlayer
  $player.AudioDevice = $device
  $player.Source = [Windows.Media.Core.MediaSource]::CreateFromStream($stream, $stream.ContentType)
  $player.Play()
  $session = $player.PlaybackSession
  $deadline = [DateTime]::UtcNow.AddMinutes(5)
  Start-Sleep -Milliseconds 200
  while ([DateTime]::UtcNow -lt $deadline) {
    $duration = $session.NaturalDuration.TotalMilliseconds
    if ($duration -gt 0 -and $session.Position.TotalMilliseconds -ge $duration) { break }
    if ($session.PlaybackState -eq 'Paused' -or $session.PlaybackState -eq 'None') { break }
    Start-Sleep -Milliseconds 100
  }
  $player.Dispose()
} else {
  Add-Type -AssemblyName System.Speech
  $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
  if ($env:SPEED_DECK_VOICE) { $synth.SelectVoice($env:SPEED_DECK_VOICE) }
  $synth.Rate = [int][Math]::Max(-10, [Math]::Min(10, [Math]::Round([Math]::Log($rate, 2) * 10)))
  $synth.SetOutputToDefaultAudioDevice()
  $synth.Speak($text)
}
`;

const LIST_VOICES_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$list = @($synth.GetInstalledVoices() | Where-Object { $_.Enabled } | ForEach-Object {
  [pscustomobject]@{ id = $_.VoiceInfo.Name; name = $_.VoiceInfo.Name; lang = $_.VoiceInfo.Culture.Name }
})
ConvertTo-Json -InputObject $list -Compress
`;

const LIST_DEVICES_SCRIPT = `
$ErrorActionPreference = 'Stop'
${AWAIT_HELPER}
$selector = [Windows.Media.Devices.MediaDevice]::GetAudioRenderSelector()
$devices = Await ([Windows.Devices.Enumeration.DeviceInformation]::FindAllAsync($selector)) ([Windows.Devices.Enumeration.DeviceInformationCollection])
$list = @($devices | Where-Object { $_.IsEnabled } | ForEach-Object { [pscustomobject]@{ id = $_.Id; name = $_.Name } })
ConvertTo-Json -InputObject $list -Compress
`;

/** Runs a constant script with Windows PowerShell 5.1. -EncodedCommand avoids any argv quoting issues. */
function powershell(script: string, env?: Record<string, string>): CommandSpec {
  const encoded = Buffer.from(script, "utf16le").toString("base64");
  return {
    command: "powershell.exe",
    args: ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-EncodedCommand", encoded],
    ...(env ? { env } : {}),
  };
}

/**
 * Windows: System.Speech on the default device, or WinRT SpeechSynthesizer + MediaPlayer
 * when a specific render device is selected.
 */
export const windowsSpeechPlatform: SpeechPlatform = {
  capabilities: { platform: "win32", engine: "windows-speech", supportsDeviceSelection: true },
  installHint: "Windows PowerShell 5.1 (powershell.exe) is required.",

  buildSpeakCommand(text, options) {
    return [
      powershell(SPEAK_SCRIPT, {
        SPEED_DECK_TEXT: Buffer.from(text, "utf8").toString("base64"),
        SPEED_DECK_VOICE: options.voiceId ?? "",
        SPEED_DECK_RATE: String(options.rate ?? 1),
        SPEED_DECK_DEVICE: options.deviceId ?? "",
      }),
    ];
  },

  async listVoices(runner): Promise<Voice[]> {
    const output = await readCommandOutput(runner, powershell(LIST_VOICES_SCRIPT));
    return parseWindowsJsonList(output).map((item) => ({
      id: item.id,
      name: item.name,
      lang: typeof item.lang === "string" ? item.lang : "",
      isDefault: false,
    }));
  },

  async listDevices(runner): Promise<AudioDevice[]> {
    const output = await readCommandOutput(runner, powershell(LIST_DEVICES_SCRIPT));
    return parseWindowsJsonList(output).map(({ id, name }) => ({ id, name }));
  },
};

/** PowerShell 5.1 prints a bare object instead of a one-element array, so accept both. */
export function parseWindowsJsonList(output: string): Array<{ id: string; name: string; lang?: unknown }> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(output.trim());
  } catch {
    return [];
  }
  const items = Array.isArray(parsed) ? parsed : [parsed];
  return items.flatMap((item: unknown) => {
    if (typeof item !== "object" || item === null) return [];
    const { id, name, lang } = item as Record<string, unknown>;
    if (typeof id !== "string" || typeof name !== "string") return [];
    return lang === undefined ? [{ id, name }] : [{ id, name, lang }];
  });
}
