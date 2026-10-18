param([switch]$DebugApk,[switch]$Verify,[switch]$Clean,[string]$SiteUrl='https://web-production-6bc5ed.up.railway.app')
$ErrorActionPreference='Stop'
Push-Location $PSScriptRoot
try {
# Prefer configured tools, otherwise reuse the workspace-local tools prepared for YORU.
$toolsRoot=Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) 'work'
if(-not $env:JAVA_HOME){$jdk=Get-ChildItem (Join-Path $toolsRoot 'android-tools') -Directory -Filter 'jdk-*' -ErrorAction SilentlyContinue | Select-Object -First 1;if($jdk){$env:JAVA_HOME=$jdk.FullName}}
if(-not $env:JAVA_HOME){throw 'Install JDK 17 and set JAVA_HOME, or open this project in Android Studio.'}
$sdk=$env:ANDROID_HOME
if(-not $sdk){$sdk=$env:ANDROID_SDK_ROOT}
if(-not $sdk -and (Test-Path (Join-Path $toolsRoot 'a/platforms'))){$sdk=Join-Path $toolsRoot 'a'}
if(-not $sdk){throw 'Set ANDROID_HOME to Android SDK with platform 35 and build-tools 35.0.0.'}
if(-not $env:ANDROID_USER_HOME){$env:ANDROID_USER_HOME=Join-Path $toolsRoot 'android-user'}
New-Item -ItemType Directory -Force $env:ANDROID_USER_HOME | Out-Null
$fso=New-Object -ComObject Scripting.FileSystemObject
$env:JAVA_HOME=$fso.GetFolder($env:JAVA_HOME).ShortPath
$sdkProperty=$fso.GetFolder($sdk).ShortPath.Replace('\','/')
$projectDir=$fso.GetFolder($PSScriptRoot).ShortPath
$sdkAscii=-join ($sdkProperty.ToCharArray() | ForEach-Object {if([int]$_ -gt 127){'\u{0:x4}' -f [int]$_}else{[string]$_}})
[IO.File]::WriteAllText((Join-Path $PSScriptRoot 'local.properties'),"sdk.dir=$sdkAscii`n",[Text.Encoding]::ASCII)
if(-not $DebugApk -and -not (Test-Path 'keystore.properties')){
 if(Test-Path 'yoru-release.jks'){throw 'Signing key exists without keystore.properties. Restore its password; do not replace the key.'}
 $bytes=New-Object byte[] 32
 $rng=[Security.Cryptography.RandomNumberGenerator]::Create();$rng.GetBytes($bytes);$rng.Dispose()
 $env:YORU_KEYSTORE_PASSWORD=[Convert]::ToBase64String($bytes)
 & "$env:JAVA_HOME/bin/keytool.exe" -genkeypair -keystore 'yoru-release.jks' -storetype PKCS12 -alias yoru -keyalg RSA -keysize 3072 -validity 10000 -dname 'CN=YORU' -storepass:env YORU_KEYSTORE_PASSWORD -keypass:env YORU_KEYSTORE_PASSWORD
 if($LASTEXITCODE -ne 0){throw 'Key generation failed'}
 [IO.File]::WriteAllText((Join-Path $PSScriptRoot 'keystore.properties'),"storeFile=yoru-release.jks`nstorePassword=$env:YORU_KEYSTORE_PASSWORD`nkeyAlias=yoru`nkeyPassword=$env:YORU_KEYSTORE_PASSWORD`n",[Text.Encoding]::ASCII)
 Remove-Item Env:YORU_KEYSTORE_PASSWORD
}
$cache=Join-Path $toolsRoot 'gradle-cache'
New-Item -ItemType Directory -Force $cache | Out-Null
$cache=$fso.GetFolder($cache).ShortPath
$env:GRADLE_USER_HOME=$cache
$task=if($DebugApk){'assembleDebug'}else{'assembleRelease'}
$tasks=@($task)
if($Clean){$tasks=@('clean')+$tasks}
if($Verify){$tasks+=@('testDebugUnitTest','lintDebug')}
& "$projectDir/gradlew.bat" --gradle-user-home $cache --project-dir $projectDir --no-daemon "-PyoruUrl=$SiteUrl" @tasks
if($LASTEXITCODE -ne 0){throw 'APK build failed'}
$variant=if($DebugApk){'debug'}else{'release'}
$outDir=Join-Path (Split-Path $PSScriptRoot -Parent) 'artifacts'
New-Item -ItemType Directory -Force $outDir | Out-Null
$out=Join-Path $outDir "YORU-$variant.apk"
Copy-Item -LiteralPath "app/build/outputs/apk/$variant/app-$variant.apk" -Destination $out -Force
Write-Host "APK: $out"
if(-not (Test-Path 'app/google-services.json')){Write-Host 'Firebase is not configured: this APK opens YORU, but push notifications are not active yet.'}

} finally { Pop-Location }
