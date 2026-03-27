param(
    [string]$Tag,
    [switch]$Reconfigure,
    [switch]$SkipLogin
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Split-Path -Parent $scriptDir
$versionFile = Join-Path $repoRoot 'VERSION'
$configDir = Join-Path $repoRoot '.deploy'
$configPath = Join-Path $configDir 'registry.env'

$defaultRegistryHost = 'crpi-2iicgf8z27uyvaq1.cn-hangzhou.personal.cr.aliyuncs.com'
$defaultNamespace = 'silvericekey'
$defaultRepository = 'turtle_soup_mystery'
$defaultLoginUsername = 'z516798599@qq.com'

function Write-Info([string]$Message) {
    Write-Host "[INFO] $Message" -ForegroundColor Green
}

function Write-Warn([string]$Message) {
    Write-Host "[WARN] $Message" -ForegroundColor Yellow
}

function Fail([string]$Message) {
    Write-Host "[ERROR] $Message" -ForegroundColor Red
    exit 1
}

function Read-EnvFile([string]$Path) {
    $result = @{}
    if (-not (Test-Path $Path)) {
        return $result
    }

    foreach ($line in Get-Content $Path) {
        if ([string]::IsNullOrWhiteSpace($line) -or $line.Trim().StartsWith('#')) {
            continue
        }

        $index = $line.IndexOf('=')
        if ($index -lt 1) {
            continue
        }

        $result[$line.Substring(0, $index).Trim()] = $line.Substring($index + 1).Trim()
    }

    return $result
}

function Save-EnvFile([string]$Path, [hashtable]$Values) {
    $dir = Split-Path -Parent $Path
    if (-not (Test-Path $dir)) {
        New-Item -ItemType Directory -Force -Path $dir | Out-Null
    }

    $content = @(
        "REGISTRY_HOST=$($Values.REGISTRY_HOST)"
        "LOGIN_SERVER=$($Values.LOGIN_SERVER)"
        "LOGIN_USERNAME=$($Values.LOGIN_USERNAME)"
        "REGISTRY_NAMESPACE=$($Values.REGISTRY_NAMESPACE)"
        "IMAGE_NAME=$($Values.IMAGE_NAME)"
        "IMAGE_TAG=$($Values.IMAGE_TAG)"
    )

    Set-Content -Path $Path -Value $content -Encoding UTF8
}

function Prompt-Value([string]$Label, [string]$DefaultValue = '') {
    $suffix = if ([string]::IsNullOrWhiteSpace($DefaultValue)) { '' } else { " [$DefaultValue]" }
    $value = Read-Host "$Label$suffix"
    if ([string]::IsNullOrWhiteSpace($value)) {
        return $DefaultValue
    }
    return $value.Trim()
}

function Get-ProjectVersion() {
    if (Test-Path $versionFile) {
        $version = (Get-Content -Raw $versionFile).Trim()
        if (-not [string]::IsNullOrWhiteSpace($version)) {
            return $version
        }
    }

    return '0.1.0'
}

function Normalize-Host([string]$Value) {
    return $Value.Trim().Replace('https://', '').Replace('http://', '').TrimEnd('/')
}

function Normalize-Segment([string]$Value) {
    return $Value.Trim().Trim('/')
}

function Validate-Tag([string]$Value) {
    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $false
    }

    return $Value -match '^(?:v)?\d+\.\d+\.\d+(?:[-._][0-9A-Za-z.-]+)?$'
}

function Load-Config() {
    $config = Read-EnvFile $configPath

    return @{
        REGISTRY_HOST = if ($config.ContainsKey('REGISTRY_HOST')) { $config['REGISTRY_HOST'] } else { $defaultRegistryHost }
        LOGIN_SERVER = if ($config.ContainsKey('LOGIN_SERVER')) { $config['LOGIN_SERVER'] } else { $defaultRegistryHost }
        LOGIN_USERNAME = if ($config.ContainsKey('LOGIN_USERNAME')) { $config['LOGIN_USERNAME'] } else { $defaultLoginUsername }
        REGISTRY_NAMESPACE = if ($config.ContainsKey('REGISTRY_NAMESPACE')) { $config['REGISTRY_NAMESPACE'] } else { $defaultNamespace }
        IMAGE_NAME = if ($config.ContainsKey('IMAGE_NAME')) { $config['IMAGE_NAME'] } else { $defaultRepository }
        IMAGE_TAG = if ($config.ContainsKey('IMAGE_TAG')) { $config['IMAGE_TAG'] } else { (Get-ProjectVersion) }
    }
}

function Collect-Config([hashtable]$Current) {
    $registryHost = Normalize-Host (Prompt-Value 'Registry host' $Current['REGISTRY_HOST'])
    $loginServer = Normalize-Host (Prompt-Value 'Login server' $Current['LOGIN_SERVER'])
    $loginUsername = Prompt-Value 'Login username' $Current['LOGIN_USERNAME']
    $namespace = Normalize-Segment (Prompt-Value 'Namespace' $Current['REGISTRY_NAMESPACE'])
    $imageName = Normalize-Segment (Prompt-Value 'Image name' $Current['IMAGE_NAME'])
    $tagValue = Prompt-Value 'Image version tag' $Current['IMAGE_TAG']

    if (-not (Validate-Tag $tagValue)) {
        Fail "Tag format is invalid: $tagValue"
    }

    return @{
        REGISTRY_HOST = $registryHost
        LOGIN_SERVER = $loginServer
        LOGIN_USERNAME = $loginUsername
        REGISTRY_NAMESPACE = $namespace
        IMAGE_NAME = $imageName
        IMAGE_TAG = $tagValue
    }
}

function Build-ImageReference([hashtable]$Config) {
    return "$(Normalize-Host $Config['REGISTRY_HOST'])/$(Normalize-Segment $Config['REGISTRY_NAMESPACE'])/$(Normalize-Segment $Config['IMAGE_NAME']):$($Config['IMAGE_TAG'])"
}

if ($Tag) {
    if (-not (Validate-Tag $Tag.Trim())) {
        Fail "Tag format is invalid: $Tag"
    }
}

$config = Load-Config

if ($Reconfigure.IsPresent -or -not (Test-Path $configPath)) {
    Write-Info 'Starting interactive registry configuration.'
    $config = Collect-Config $config
    Save-EnvFile -Path $configPath -Values $config
    Write-Info "Saved config to $configPath"
}

if ($Tag) {
    $config['IMAGE_TAG'] = $Tag.Trim()
    Save-EnvFile -Path $configPath -Values $config
}

$image = Build-ImageReference $config

Write-Info "Target image: $image"

if (-not $SkipLogin.IsPresent) {
    Write-Info "Running docker login $(Normalize-Host $config['LOGIN_SERVER'])"
    docker login (Normalize-Host $config['LOGIN_SERVER']) --username $config['LOGIN_USERNAME']
}

Write-Info "Building image from root Dockerfile"
docker build --pull -t $image $repoRoot

Write-Info "Pushing image to registry"
docker push $image

Write-Host ''
Write-Info 'Publish complete.'
Write-Host "docker tag [ImageId] $image"
Write-Host "docker push $image"
