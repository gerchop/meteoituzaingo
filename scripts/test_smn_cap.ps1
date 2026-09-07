param(
  [Parameter(Mandatory = $true)][string]$CapUrl,
  [double]$Latitude = -34.655,
  [double]$Longitude = -58.667
)

$settings = [System.Xml.XmlReaderSettings]::new()
$settings.DtdProcessing = [System.Xml.DtdProcessing]::Prohibit
$settings.XmlResolver = $null
$request = Invoke-WebRequest -Uri $CapUrl -UseBasicParsing -TimeoutSec 30
$reader = [System.Xml.XmlReader]::Create([System.IO.StringReader]$request.Content, $settings)
$document = [System.Xml.XmlDocument]::new()
$document.XmlResolver = $null
$document.Load($reader)
$namespace = [System.Xml.XmlNamespaceManager]::new($document.NameTable)
$namespace.AddNamespace('cap', 'urn:oasis:names:tc:emergency:cap:1.2')
$alert = $document.SelectSingleNode('/cap:alert', $namespace)

function Test-PointInPolygon([double]$PointLat, [double]$PointLon, [string]$Polygon) {
  $points = @($Polygon.Trim() -split '\s+' | ForEach-Object {
    $pair = $_ -split ','
    if ($pair.Count -ne 2) { throw "Coordenada CAP inválida: $_" }
    [pscustomobject]@{ Lat = [double]::Parse($pair[0], [Globalization.CultureInfo]::InvariantCulture); Lon = [double]::Parse($pair[1], [Globalization.CultureInfo]::InvariantCulture) }
  })
  if ($points.Count -lt 3) { return $false }
  $inside = $false
  for ($i = 0; $i -lt $points.Count; $i++) {
    $j = if ($i -eq 0) { $points.Count - 1 } else { $i - 1 }
    $a = $points[$i]; $b = $points[$j]
    if ((($a.Lat -gt $PointLat) -ne ($b.Lat -gt $PointLat)) -and ($PointLon -lt (($b.Lon - $a.Lon) * ($PointLat - $a.Lat) / ($b.Lat - $a.Lat) + $a.Lon))) { $inside = -not $inside }
  }
  return $inside
}

$info = $alert.SelectSingleNode('cap:info', $namespace)
$areas = @($info.SelectNodes('cap:area', $namespace))
Write-Output 'SMN CAP AUDIT'
Write-Output "CAP: $CapUrl"
Write-Output "Identifier: $($alert.SelectSingleNode('cap:identifier', $namespace).InnerText)"
Write-Output "msgType: $($alert.SelectSingleNode('cap:msgType', $namespace).InnerText)"
Write-Output "Event: $($info.SelectSingleNode('cap:event', $namespace).InnerText)"
Write-Output "Severity: $($info.SelectSingleNode('cap:severity', $namespace).InnerText)"
Write-Output "Expires: $($info.SelectSingleNode('cap:expires', $namespace).InnerText)"
foreach ($area in $areas) {
  $polygon = $area.SelectSingleNode('cap:polygon', $namespace)
  if ($polygon) { Write-Output "Polygon: sí; punto ($Latitude,$Longitude): $(Test-PointInPolygon $Latitude $Longitude $polygon.InnerText)" }
  if ($area.SelectSingleNode('cap:circle', $namespace)) { Write-Output 'Circle: sí (requiere cálculo geodésico en la futura integración).' }
  if ($area.SelectNodes('cap:geocode', $namespace).Count) { Write-Output 'Geocode: sí (auditar catálogo antes de usarlo).' }
}
