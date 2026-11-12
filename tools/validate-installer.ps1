$tokens=$null
$errors=$null
$target=Join-Path $PSScriptRoot '..\desktop\install.ps1'
[System.Management.Automation.Language.Parser]::ParseFile($target,[ref]$tokens,[ref]$errors) | Out-Null
foreach($issue in $errors) { Write-Output $issue.Message }
if($errors.Count) { exit 1 }
Write-Output 'PASS installer syntax'
