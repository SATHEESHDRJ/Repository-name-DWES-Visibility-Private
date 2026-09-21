# Recreate restore API with Nest11 image (local only). Env copied from prior container at runtime.
$old = "dwes_oci_restore_api_20260725_082028"
$img = "dwes-api:oci-restore-20260725-nest11"
$envLines = docker inspect $old --format "{{range .Config.Env}}{{println .}}{{end}}" |
  Where-Object { $_ -and ($_ -notmatch '^(PATH|NODE_VERSION)=') }
$envArgs = foreach ($line in $envLines) { @('-e', $line) }
docker stop $old | Out-Null
docker rename $old "${old}_pre_nest11" | Out-Null
docker run -d --name $old `
  --network dwes_oci_restore_20260725_082028_internal --network-alias api `
  -p 127.0.0.1:3101:3001 `
  -v dwes_oci_restore_uploads_20260725_082028:/app/uploads `
  -v dwes_oci_restore_auth_20260725_082028:/app/data `
  --restart unless-stopped `
  --health-cmd "wget -qO- http://127.0.0.1:3001/api/health" `
  --health-interval 30s --health-timeout 5s --health-retries 5 `
  @envArgs `
  $img
