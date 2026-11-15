# Run this YOURSELF in your own terminal. It asks for your AI33 key with hidden input and saves it to the git-ignored file
# docs/work/tutorial-video/.env.local. Nothing is printed, committed or sent anywhere; the assistant never sees the key.
#   powershell -NoProfile -File docs/work/tutorial-video/scripts/set-ai33-key.ps1
$dest = Join-Path (Split-Path -Parent $PSScriptRoot) '.env.local'
$secure = Read-Host 'Paste your AI33 API key (hidden, press Enter)' -AsSecureString
$bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try { $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
if ([string]::IsNullOrWhiteSpace($plain)) { Write-Host 'Nothing entered; file not changed.'; exit 1 }
Set-Content -Path $dest -Value ("AI33_API_KEY=" + $plain.Trim()) -Encoding ascii
Write-Host "Saved to $dest (git-ignored). You can close this window."
