Get-ChildItem -Path src/components -Filter '*.tsx' -Recurse | ForEach-Object {
    $content = Get-Content $_.FullName -Raw
    $cleaned = $content -replace 'rounded-\[\d+px\]', ''
    $cleaned = $cleaned -replace 'rounded-full', ''
    $cleaned = $cleaned -replace 'rounded-lg', ''
    $cleaned = $cleaned -replace 'rounded-xl', ''
    $cleaned = $cleaned -replace 'shadow-lg', ''
    $cleaned = $cleaned -replace 'shadow-md', ''
    $cleaned = $cleaned -replace 'shadow-sm', ''
    Set-Content $_.FullName -Value $cleaned
    Write-Host "Cleaned: $($_.FullName)"
}
